import * as uuid from "uuid";
import { Errors, ExtensionError } from "../utilities/error";

/// App-password prefix.
const PREFIX = 'mzp_';

export default class AppPassword {
    clientId: string;
    secretKey: string;

    constructor(clientId: string, secretKey: string) {
        this.clientId = clientId;
        this.secretKey = secretKey;
    }

    toString() {
      return PREFIX + this.clientId.replace(/-/g, "") + this.secretKey.replace(/-/g, "");
    }

    static formatDashlessUuid(dashlessUuid: string): string {
      const uuidWithDashes = [
        dashlessUuid.substring(0, 8),
        dashlessUuid.substring(8, 12),
        dashlessUuid.substring(12, 16),
        dashlessUuid.substring(16, 20),
        dashlessUuid.substring(20)
      ].join("-");

      return uuidWithDashes;
    }

    static fromString(password: string) {

        const strippedPassword = password.replace(PREFIX, '');
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
            throw new Error(Errors.invalidLengthAppPassword);
          }

          // Lazy way to rebuild uuid.
          try {
            const clientId = AppPassword.formatDashlessUuid(filteredChars.slice(0, 32).join(''));
            const secretKey = AppPassword.formatDashlessUuid(filteredChars.slice(32).join(''));

            return {
              clientId,
              secretKey,
            };
          } catch (err) {
            console.log("[AppPassword]", "Error parsing UUID.");
            throw new ExtensionError(Errors.invalidAppPassword, err);
          }
        }

        throw new ExtensionError(Errors.invalidAppPassword, "Invalid length.");
      }
}