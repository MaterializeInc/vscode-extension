import { createHash, randomBytes } from "crypto";
import express, { Request, Response } from "express";
import { AddressInfo } from "net";
import AppPassword from "../context/appPassword";
import { DEFAULT_ADMIN_ENDPOINT } from "./admin";

// Please update this link if the logo location changes in the future.
const LOGO_URL = "https://materialize.com/svgs/brand-guide/materialize-purple-mark.svg";

/**
 * Returns a proper HTML webpage to render the response in the browser.
 * @param output
 * @returns
 */
function formatOutput(output: string): string {
    return `
        <body style="margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background-color: #f0f0f0;">
            <div style="text-align: center; padding: 100px; background-color: #ffffff; border-radius: 10px; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);">
                <img src="${LOGO_URL}" alt="logo">
                <h2 style="padding-top: 20px; font-family: Inter, Arial, sans-serif;">${output}</h2>
            </div>
        </body>
    `;
}

function base64Url(bytes: Buffer): string {
    return bytes.toString("base64url");
}

async function postOrThrow(url: string, init: RequestInit, step: string) {
    const response = await fetch(url, { method: "post", ...init });
    if (!response.ok) {
        throw new Error(`${step} returned ${response.status}: ${await response.text()}`);
    }
    return response.json() as Promise<Record<string, string>>;
}

/**
 * Registers a public OAuth client that may only redirect to `redirectUri`
 * (RFC 7591) and returns its client ID.
 */
async function registerClient(adminEndpoint: string, redirectUri: string, name: string): Promise<string> {
    const { client_id: clientId } = await postOrThrow(`${adminEndpoint}/oauth/dcr/register`, {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            /* eslint-disable @typescript-eslint/naming-convention */
            client_name: name,
            redirect_uris: [redirectUri],
            grant_types: ["authorization_code"],
            response_types: ["code"],
            token_endpoint_auth_method: "none",
            /* eslint-enable @typescript-eslint/naming-convention */
        }),
    }, "Client registration");
    return clientId;
}

/**
 * Signs the user in through the admin endpoint's OAuth authorization server
 * and creates an app password with the resulting access token.
 *
 * This is the authorization code flow for native apps (RFC 8252) with PKCE
 * (RFC 7636). The browser only carries a single-use authorization code, which
 * cannot be redeemed without the code verifier, and the verifier never leaves
 * this process.
 *
 * @param description description of the new app password.
 * @param openBrowser opens the authorization URL for the user.
 * @param adminEndpoint the admin endpoint hosting the authorization server.
 * @returns the app password, or nothing if the user cancels the login.
 */
export async function oauthLogin(
    description: string,
    openBrowser: (url: string) => Thenable<unknown>,
    adminEndpoint: string = DEFAULT_ADMIN_ENDPOINT,
): Promise<AppPassword | undefined> {
    const codeVerifier = base64Url(randomBytes(32));
    const codeChallenge = base64Url(createHash("sha256").update(codeVerifier).digest());
    const state = base64Url(randomBytes(16));

    const app = express();
    // Assigned synchronously by the promise executor below.
    let onCallback!: (code: string | undefined, error?: Error) => void;
    const callback = new Promise<string | undefined>((resolve, reject) => {
        onCallback = (code, error) => (error ? reject(error) : resolve(code));
    });

    app.get("/", (req: Request, res: Response) => {
        const { code, state: returnedState, error, error_description: errorDescription } = req.query;

        // Any local process or web page can reach this listener, so a callback
        // is only trusted when it echoes the `state` sent to the authorization
        // endpoint. Requests that fail the check do not end the login.
        if (returnedState !== state) {
            res.status(400).send(formatOutput("Invalid login request."));
            return;
        }

        if (typeof code === "string" && !error) {
            res.send(formatOutput("You can now close the tab."));
            onCallback(code);
        } else if (error === "access_denied") {
            res.send(formatOutput("Login canceled. You can now close the tab."));
            onCallback(undefined);
        } else {
            res.send(formatOutput("Login failed. Please, try again or communicate with support."));
            onCallback(undefined, new Error(String(errorDescription || error || "missing authorization code")));
        }
    });

    const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
        const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    });

    try {
        // RFC 8252 §7.3: use the loopback IP literal, not `localhost`.
        const redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
        const clientId = await registerClient(adminEndpoint, redirectUri, description);

        const authorizeUrl = new URL(`${adminEndpoint}/oauth/authorize`);
        authorizeUrl.search = new URLSearchParams({
            /* eslint-disable @typescript-eslint/naming-convention */
            response_type: "code",
            client_id: clientId,
            redirect_uri: redirectUri,
            scope: "openid",
            state,
            code_challenge: codeChallenge,
            code_challenge_method: "S256",
            /* eslint-enable @typescript-eslint/naming-convention */
        }).toString();
        await openBrowser(authorizeUrl.toString());

        const code = await callback;
        if (code === undefined) {
            return undefined;
        }

        const { access_token: accessToken } = await postOrThrow(`${adminEndpoint}/oauth/token`, {
            body: new URLSearchParams({
                /* eslint-disable @typescript-eslint/naming-convention */
                grant_type: "authorization_code",
                code,
                redirect_uri: redirectUri,
                client_id: clientId,
                code_verifier: codeVerifier,
                /* eslint-enable @typescript-eslint/naming-convention */
            }),
        }, "Token exchange");

        const { clientId: passwordClientId, secret } = await postOrThrow(
            `${adminEndpoint}/frontegg/identity/resources/users/api-tokens/v1`,
            {
                headers: {
                    /* eslint-disable @typescript-eslint/naming-convention */
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${accessToken}`,
                    /* eslint-enable @typescript-eslint/naming-convention */
                },
                body: JSON.stringify({ description }),
            },
            "App password creation",
        );

        return new AppPassword(passwordClientId, secret);
    } finally {
        server.close();
    }
}
