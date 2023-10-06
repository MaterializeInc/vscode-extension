import fetch from "node-fetch";
import path from "path";
import {
    Executable,
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
} from "vscode-languageclient/node";
import fs from "fs";
import zlib from "zlib";
import tar from "tar";
import stream from "stream";
import os from "os";

// This endpoint returns a string with the latest LSP version.
const BINARIES_ENDPOINT = "https://binaries.materialize.com";
const LATEST_VERSION_ENDPOINT = `${BINARIES_ENDPOINT}/mz-lsp-server-latest.version`;

/// Path to the binaries dir.
const BIN_DIR_PATH: string = path.join(__dirname, "bin");
/// Tmp dir path to place the downloaded tarball (.tar.gz)
const TMP_DIR_PATH: string = path.join(os.tmpdir());
/// The server binary path after decompress
const SERVER_DECOMPRESS_PATH: string = path.join(os.tmpdir(), "mz", "bin", "mz-lsp-server");
/// The final server binary path.
const SERVER_PATH: string = path.join(__dirname, "bin", "mz-lsp-server");

/// This class implements the Language Server Protocol (LSP) client for Materialize.
/// The LSP is downloaded for an endpoint an it is out of the bundle. Binaries are heavy-weight
/// and is preferable to download on the first activation.
/// This is only the first approach and will evolve with time.
export default class LspClient {
    private client: LanguageClient | undefined;

    constructor() {
        this.installLpsServer();
    }

    installLpsServer() {
        if (this.isValidOs()) {
            if (!fs.existsSync(SERVER_PATH)) {
                fs.mkdirSync(BIN_DIR_PATH, { recursive: true });
                this.fetchLsp().then((tarballArrayBuffer) => {
                    console.log("[LSP]", "Decompressing LSP.");
                    this.decompress(tarballArrayBuffer, TMP_DIR_PATH).then(() => {
                        console.log("[LSP]", "Starting the client.");
                        fs.renameSync(SERVER_DECOMPRESS_PATH, SERVER_PATH);
                        this.startClient(SERVER_PATH);
                    });
                }).catch((err) => {
                    console.error("[LSP]", "Error fetching the LSP: ", err);
                });
            } else {
                console.log("[LSP]", "The server already exists.");
                console.log("[LSP]", "Starting the client.");
                this.startClient(SERVER_PATH);
            }
        } else {
            console.error("[LSP]", "Invalid operating system.");
            return;
        }
    }

    decompress(arrayBuffer: ArrayBuffer, path: string) {
        const gunzip = zlib.createGunzip();
        const extract = tar.extract({
            cwd: path
        });

        // Pass the buffer.
        const bufferStream = new stream.PassThrough();
        bufferStream.end(Buffer.from(arrayBuffer));
        return new Promise((res, rej) => {
            console.log("[LSP]", "Starting pipe.");
            bufferStream
                .pipe(gunzip)
                .pipe(extract)
                .on('finish', (d: any) => {
                    console.log("[LSP]", "Server installed.");
                    res("");
                })
                .on('error', (error: any) => {
                    console.error("[LSP]", "Error during decompression:", error);
                    rej("Error during compression");
                });
        });
    }

    isMacOs() {
        return process.platform === "darwin";
    }

    isLinuxOs() {
        return process.platform === "linux";
    }

    isArm64() {
        return process.arch === "arm64";
    }

    isX64() {
        return process.arch === "x64";
    }

    getArch() {
        if (process.platform === "darwin") {
            return "apple-darwin";
        } else if (process.platform === "linux") {
            return "unknown-linux-gnu";
        }
    }

    getPlatform() {
        if (process.arch === "arm64") {
            return "arm64";
        } else if (process.arch === "x64") {
            return "aarch64";
        }
    }

    /**
     * Returns the correct endpoint depending the OS.
     * @param lastVersion
     * @returns
     */
    getEndpointByOs(latestVersion: string): string {
        const arch = this.getArch();
        const platform = this.getPlatform();

        if (!arch || !platform) {
            throw new Error("Invalid operating system for the LSP.");
        }

        return BINARIES_ENDPOINT + `/mz-lsp-server-v${latestVersion}-${this.getPlatform()}-${this.getArch()}.tar.gz`;
    }

    async fetchLsp(): Promise<ArrayBuffer> {
        console.log("[LSP]", "Fetching latest version number.");
        const response = await fetch(LATEST_VERSION_ENDPOINT);
        const lastVersion: string = await response.text();
        const endpoint = this.getEndpointByOs(lastVersion);

        console.log("[LSP]", `Fetching LSP from: ${endpoint}`);
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
        return this.getArch() !== undefined && this.getPlatform() !== undefined;
    }

    stop() {
        this.client && this.client.stop();
    }
}