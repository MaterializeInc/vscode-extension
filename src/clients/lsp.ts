import fetch from "node-fetch";
import path from "path";
import {
    Executable,
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
} from "vscode-languageclient/node";
import fs from "fs";

// This endpoint contains a JSON file with an endpoint of the latest LSP version.
const LATEST_VERSION_ENDPOINT = "https://lsp-test-ack-joaquin-colacci-for-deletion.s3.amazonaws.com/latest_version";

interface LastVersionContent {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    darwin_arm64: string;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    linux_x64: string;
}

/// This class implements the Language Server Protocol (LSP) client for Materialize.
/// The LSP is downloaded for an endpoint an it is out of the bundle. Binaries are heavy-weight
/// and is preferable to download on the first activation.
/// This is only the first approach and will evolve with time.
export default class LspClient {
    private client: LanguageClient | undefined;

    constructor() {
        // TODO: Implement version checking.
        let serverPath: string = path.join(__dirname, 'bin', 'materialize-language-server');
        console.log("[LSP]", "Server path: ", serverPath);
        if (this.isValidOs()) {
            if (!fs.existsSync(serverPath)) {
                this.fetchLsp().then((lspArrayBuffer) => {
                    console.log("[LSP]", "Writing LSP into the dir.");
                    fs.writeFileSync(serverPath, Buffer.from(lspArrayBuffer));

                    console.log("[LSP]", "Starting the client.");
                    this.startClient(serverPath);
                }).catch((err) => {
                    console.error("[LSP]", "Error fetching the LSP: ", err);
                });
            } else {
                console.log("[LSP]", "The server already exists.");
                console.log("[LSP]", "Starting the client.");
                this.startClient(serverPath);
            }
        } else {
            return;
        }
    }

    isValidMacOs() {
        return (process.platform === "darwin" && process.arch === "arm64");
    }

    isValidLinuxOs() {
        return (process.platform === "linux" && process.arch === "x64");
    }

    /**
     * Returns the correct endpoint depending the OS.
     * @param lastVersionContent
     * @returns
     */
    getEndpointByOs(lastVersionContent: LastVersionContent): string {
        if (this.isValidMacOs()) {
            return lastVersionContent.darwin_arm64;
        } else if (this.isValidLinuxOs()) {
            return lastVersionContent.linux_x64;
        } else {
            throw new Error("Invalid operating system for the LSP.");
        }
    }

    async fetchLsp(): Promise<ArrayBuffer> {
        const response = await fetch(LATEST_VERSION_ENDPOINT);
        const lastVersionContent: LastVersionContent = await response.json() as LastVersionContent;
        const endpoint = this.getEndpointByOs(lastVersionContent);
        console.log("[LSP]", "Endpoint: ", endpoint);

        const binaryResponse = await fetch(endpoint);
        const buffer = await binaryResponse.arrayBuffer();

        return buffer;
    }

    startClient(serverPath: string) {
        // Build the options
        const run: Executable = {
            command: serverPath,
        };
        const serverOptions: ServerOptions = {
            run,
            debug: run,
        };
        let clientOptions: LanguageClientOptions = {
            documentSelector: [{ scheme: "file", language: "materialize-sql"}]
        };

        // Create the language client and start the client.
        this.client = new LanguageClient("materialize-language-server", "Materialize language server", serverOptions, clientOptions);
        this.client.start();
    }

    /**
     * The valid operating systems so far are MacOS (Darwin) ARM64 and Linux x64.
     * @returns true if it is one of both OS.
     */
    isValidOs() {
        return this.isValidMacOs() || this.isValidLinuxOs();
    }

    stop() {
        this.client && this.client.stop();
    }
}