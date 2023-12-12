import express from 'express';
import { json } from 'body-parser';
import { sign } from 'node-jsonwebtoken';
import { generateKeyPairSync } from 'crypto';

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