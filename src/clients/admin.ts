import fetch from "node-fetch";
import AppPassword from "../context/appPassword";
import { Errors, ExtensionError } from "../utilities/error";
import jwksClient from "jwks-rsa";
import { verify } from "node-jsonwebtoken";

interface AuthenticationResponse {
    accessToken: string,
    expires: string,
    expiresIn: number,
    refreshToken: string,
}

interface AuthenticationRequest {
    clientId: string,
    secret: string,
}

const DEFAULT_ADMIN_ENDPOINT = 'https://admin.cloud.materialize.com';

export default class AdminClient {
    auth?: AuthenticationResponse;
    appPassword: AppPassword;
    adminEndpoint: string;
    jwksEndpoint: string;

    constructor (appPassword: string, endpoint?: string) {
        this.appPassword = AppPassword.fromString(appPassword);

        const finalEndpoint = (endpoint || DEFAULT_ADMIN_ENDPOINT);
        const cleanEndpoint = finalEndpoint.endsWith("/")
            ? finalEndpoint.substring(0, finalEndpoint.length - 1)
            : finalEndpoint;

        this.adminEndpoint = `${cleanEndpoint}/identity/resources/auth/v1/api-token`;
        this.jwksEndpoint = `${cleanEndpoint}/.well-known/jwks.json`;
    }

    async getToken() {
        // TODO: Expire should be at the half of the expiring time.
        if (!this.auth || (new Date(this.auth.expires) < new Date())) {
            const authRequest: AuthenticationRequest = {
                clientId: this.appPassword.clientId,
                secret: this.appPassword.secretKey
            };

            const response = await fetch(this.adminEndpoint, {
                method: 'post',
                body: JSON.stringify(authRequest),
                // eslint-disable-next-line @typescript-eslint/naming-convention
                headers: {'Content-Type': 'application/json'}
            });

            if (response.status === 200) {
                this.auth = (await response.json()) as AuthenticationResponse;
                return this.auth.accessToken;
            } else {
                const { errors } = await response.json() as any;
                const [error] = errors;
                console.error("[AdminClient]", "Error during getToken: ", error);

                throw new Error(error);
            }
        } else {
            return this.auth.accessToken;
        }
    }

    /// Returns the JSON Web Key Set (JWKS) from the well known endpoint: `/.well-known/jwks.json`
    private async getJwks() {
        const client = jwksClient({
            jwksUri: this.jwksEndpoint
        });

        const keys = await client.getSigningKeys();
        return keys;
    }

    /// Verifies the JWT signature using a JWK from the well-known endpoint and
    /// returns the user claims.
    private async getClaims() {
        console.log("[AdminClient]", "Getting Token.");
        const token = await this.getToken();

        try {
            console.log("[AdminClient]", "Getting JWKS.");
            const [jwk] = await this.getJwks();
            const key = jwk.getPublicKey();

            // Ignore expiration during tests
            const authData = verify(token, key, { complete: true });

            return authData.payload;
        } catch (err) {
            console.error("[AdminClient]", "Error retrieving claims: ", err);
            throw new ExtensionError(Errors.verifyCredential, err);
        }
    }

    /// Returns the current user's email.
    async getEmail() {
        const claimOrPayload = await this.getClaims();
        try {
            const claims = typeof claimOrPayload === "string" ? JSON.parse(claimOrPayload) : claimOrPayload;

            if (!claims.email) {
                throw new Error(Errors.emailNotPresentInClaims);
            } else {
                return claims.email as string;
            }
        } catch (err) {
            console.error("[AdminClient]", "Error retrieving email: ", err);
            throw new ExtensionError(Errors.retrievingEmail, err);
        }
    }
}

