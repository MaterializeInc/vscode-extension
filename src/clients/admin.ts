import fetch from "node-fetch";
import AppPassword from "../context/appPassword";
const jwksClient = require("jwks-rsa");
const jwt = require("node-jsonwebtoken");

interface AuthenticationResponse {
    accessToken: string,
    expires: string,
    expiresIn: Number,
    refreshToken: string,
};

interface AuthenticationRequest {
    clientId: string,
    secret: string,
};

const DEFAULT_ADMIN_ENDPOINT = 'https://admin.cloud.materialize.com';

export default class AdminClient {
    auth?: AuthenticationResponse;
    appPassword: AppPassword;
    tokenEndpoint: string;
    jwksEndpoint: string;

    constructor (appPassword: string, endpoint?: string) {
        this.appPassword = AppPassword.fromString(appPassword);

        this.tokenEndpoint = `${endpoint || DEFAULT_ADMIN_ENDPOINT}/identity/resources/auth/v1/api-token`;
        this.jwksEndpoint = `${endpoint || DEFAULT_ADMIN_ENDPOINT}/.well-known/jwks.json`;
    }

    async getToken() {
        // TODO: Expire should be at the half of the expiring time.
        if (!this.auth || new Date(this.auth.expires) > new Date()) {
            const authRequest: AuthenticationRequest = {
                clientId: this.appPassword.clientId,
                secret: this.appPassword.secretKey
            };

            const response = await fetch(this.tokenEndpoint, {
                method: 'post',
                body: JSON.stringify(authRequest),
                // eslint-disable-next-line @typescript-eslint/naming-convention
                headers: {'Content-Type': 'application/json'}
            });

            this.auth = (await response.json()) as AuthenticationResponse;
            return this.auth.accessToken;
        } else {
            return this.auth.accessToken;
        }
    }

    /// Returns the JSON Web Key Set (JWKS) from the well known endpoint: `/.well-known/jwks.json`
    async getJwks() {
        const client = jwksClient({
            jwksUri: this.jwksEndpoint
        });

        const keys = await client.getSigningKeys();
        return keys;
    }

    /// Verifies the JWT signature using a JWK from the well-known endpoint and
    /// returns the user claims.
    async getClaims() {
        const [jwk] = await this.getJwks();
        const key = jwk.getPublicKey();
        const token = await this.getToken();

        // Ignore expiration during tests
        // The extension is not in charge of manipulating any type of information in Materialize servers.
        const authData = jwt.verify(token, key, { complete: true });

        return authData.payload;
    }

    /// Returns the current user's email.
    async getEmail() {
        const claims = await this.getClaims();
        if (typeof claims === "string") {
            return JSON.parse(claims).email as string;
        } else {
            return claims.email as string;
        }
    }
}

