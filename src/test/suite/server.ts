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

export function mockServers(): Promise<string> {
    const app = express();

    app.use(json());

    const { privateKey, publicKey } = generateKeyPairSync('rsa', keyPairOptions);

	var token = sign({ foo: 'bar' },
    {
      key: privateKey,
      passphrase
    } as any,
    { algorithm: 'RS256', expiresIn: 600, });

    app.post('/identity/resources/auth/v1/api-token', (_, res) => {
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

    app.get('/.well-known/jwks.json', (_, res) => { res.json(jwks)});

    app.get('/api/region', (_, res) => {
        res.json({
            regionInfo: {
                sqlAddress: "localhost:6875",
                httpAddress: "localhost:6875",
                resolvable: true,
                enabledAt: new Date().toString(),
        }});
    });

	return new Promise((res, rej) => {
		const server = app.listen(0, 'localhost', () => {
			const addressInfo = server.address();
			if (!addressInfo || typeof addressInfo === "string") {
				rej("Wrong address type.");
			} else {
				const endpoint = `http://${addressInfo.address}:${addressInfo.port}`;

                app.get('/api/cloud-regions', (_, res) => {
                    res.json({
                        data: [{
                            id: "aws/us-east-1",
                            name: "us-east-1",
                            url: endpoint,
                            cloudProvider: "aws",
                        }, {
                            id: "aws/eu-west-1",
                            name: "eu-west-1",
                            url: endpoint,
                            cloudProvider: "aws",
                        }],
                        nextCursor: undefined,
                    });
                });

				console.log(`Mock server listening at ${endpoint}`);
				res(endpoint);
			}
		});
	});
}