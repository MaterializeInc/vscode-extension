import * as uuid from "uuid";

const PREFIX = 'mzp_';

export default class AppPassword {
    clientId: string;
    secretKey: string;

    constructor(clientId: string, secretKey: string) {
        this.clientId = clientId;
        this.secretKey = secretKey;
    }

    toString() {
        const encoded = Buffer.from(this.clientId + this.secretKey).toString('base64');
        return PREFIX + encoded;
    }

    static fromString(password: string) {
        const PREFIX = 'mzp_'; // Replace 'prefix' with the actual prefix used in Rust code

        let strippedPassword = password.replace(PREFIX, '');
        if (strippedPassword.length === 43 || strippedPassword.length === 44) {
          // If it's exactly 43 or 44 bytes, assume we have base64-encoded
          // UUID bytes without or with padding, respectively.
          const stringAppPassword = Buffer.from(strippedPassword, 'base64');
          const clientId = stringAppPassword.slice(0, 16);
          const secretKey = stringAppPassword.slice(16);

          return {
              clientId: uuid.stringify(clientId),
              secretKey: uuid.stringify(secretKey),
          };
        } else if (strippedPassword.length >= 64) {
          // TODO: TEST
          // If it's more than 64 bytes, assume we have concatenated
          // hex-encoded UUIDs, possibly with some special characters mixed in.
          const filteredChars = Array.from(strippedPassword).filter((c: string) =>
            c.match(/[0-9a-zA-Z]/)
          );

          if (filteredChars.length !== 64) {
            throw new Error();
          }

          const clientId = filteredChars.slice(0, 32).join('');
          const secretKey = filteredChars.slice(32).join('');

          return {
            clientId,
            secretKey,
          };
        }

        throw new Error("Invalid app-password");
      }
}