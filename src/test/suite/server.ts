import express from 'express';
import { json, urlencoded } from 'body-parser';
import { sign } from 'node-jsonwebtoken';
import { createHash, generateKeyPairSync } from 'crypto';

const passphrase = 'secret-passphrase';
const keyPairOptions = {
  modulusLength: 2048,
  publicKeyEncoding: {
    format: 'jwk',
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem',
    cipher: 'aes-256-cbc',
    passphrase,
  },
};

export function mockServer(): Promise<string> {
    const app = express();

    app.use(json());
    app.use(urlencoded({ extended: false }));

    const { privateKey, publicKey } = generateKeyPairSync('rsa', keyPairOptions);

	const token = sign({ foo: 'bar', email: "materialize" },
    {
      key: privateKey,
      passphrase
    } as any,
    { algorithm: 'RS256', expiresIn: 600, });

    app.post('/identity/resources/auth/v1/api-token', (req, res) => {
        const clientId = req.body.clientId;
        if (clientId === "52881e4b-8c72-4ec1-bcc6-f9d22155821b") {
            res.status(401).send({ errors: ["Invalid authentication"] });
            return;
        }

        res.json({
            accessToken: token,
            expires: "Mon, 31 Jul 2023 10:59:33 GMT",
            expiresIn: 600,
            refreshToken: "MOCK",
        });
    });

    // OAuth authorization server. `/oauth/authorize` skips the login page and
    // redirects straight back with a code bound to the PKCE challenge.
    const MOCK_CLIENT_ID = "mock-oauth-client";
    const challenges = new Map<string, string>();

    app.post('/oauth/dcr/register', (req, res) => {
        res.status(201).json({ client_id: MOCK_CLIENT_ID, redirect_uris: req.body.redirect_uris });
    });

    app.get('/oauth/authorize', (req, res) => {
        const { client_id, redirect_uri, state, code_challenge } = req.query as Record<string, string>;
        if (client_id !== MOCK_CLIENT_ID) {
            res.status(400).send("unknown client");
            return;
        }
        const code = `code-${challenges.size}`;
        challenges.set(code, code_challenge);
        res.redirect(`${redirect_uri}?code=${code}&state=${encodeURIComponent(state)}`);
    });

    app.post('/oauth/token', (req, res) => {
        const { code, code_verifier } = req.body;
        const challenge = createHash('sha256').update(code_verifier ?? '').digest('base64url');
        if (!challenges.has(code) || challenges.get(code) !== challenge) {
            res.status(400).json({ error: "invalid_grant" });
            return;
        }
        challenges.delete(code);
        res.json({ access_token: token, token_type: "Bearer", expires_in: 600 });
    });

    app.post('/frontegg/identity/resources/users/api-tokens/v1', (req, res) => {
        if (req.headers.authorization !== `Bearer ${token}`) {
            res.status(401).json({ errors: ["Invalid authentication"] });
            return;
        }
        res.json({
            clientId: "4e5c0aea-72ac-41de-946c-57f1b67bb3af",
            secret: "4e5c0aea-72ac-41de-946c-57f1b67bb3af",
            description: req.body.description,
        });
    });

    const jwks = {
        keys: [publicKey],
    };

    app.get('/.well-known/jwks.json', (_, res) => res.json(jwks));

    app.get('/api/region', (_, res) => {
        res.json({
            regionInfo: {
                sqlAddress: "localhost:6875",
                httpAddress: "localhost:6875",
                resolvable: true,
                enabledAt: new Date().toString(),
        }});
    });

    app.get('/api/cloud-regions', (_, res) => {
        res.json({
            data: [{
                id: "aws/us-east-1",
                name: "us-east-1",
                url: "http://localhost:3000",
                cloudProvider: "aws",
            }, {
                id: "aws/eu-west-1",
                name: "eu-west-1",
                url: "http://localhost:3000",
                cloudProvider: "aws",
            }],
            nextCursor: undefined,
        });
    });

	return new Promise((res) => {
		const server = app.listen(3000, 'localhost', () => {
            console.log(`Mock server listening at localhost:3000: `, server.listening);
            res("Loaded.");
		});
	});
}