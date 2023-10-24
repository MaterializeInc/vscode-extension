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
import { SemVer } from "semver";

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
        if (this.isValidOs()) {
            if (!this.isInstalled()) {
                this.installAndStartLspServer();
            } else {
                console.log("[LSP]", "The server already exists.");
                this.startClient();
                this.serverUpgradeIfAvailable();
            }
        } else {
            console.error("[LSP]", "Invalid operating system.");
            return;
        }
    }

    /**
     *
     * @returns true if the LSP Server is installed.
     */
    private isInstalled() {
        return fs.existsSync(SERVER_PATH);
    }

    /**
     * Decompress the tarball and rename the file to the end path.
     * @param tarballArrayBuffer LSP server binary
     */
    private async decompressAndInstallBinaries(tarballArrayBuffer: ArrayBuffer) {
        console.log("[LSP]", "Decompressing LSP.");
        await this.decompress(tarballArrayBuffer, TMP_DIR_PATH);
        fs.renameSync(SERVER_DECOMPRESS_PATH, SERVER_PATH);
    }

    /**
     * Fetchs and installs the LSP server.
     */
    private async installAndStartLspServer() {
        try {
            fs.mkdirSync(BIN_DIR_PATH, { recursive: true });
            const tarballArrayBuffer = await this.fetchLsp();
            await this.decompressAndInstallBinaries(tarballArrayBuffer);
            this.startClient();
        } catch (err) {
            console.error("[LSP]", "Error fetching the LSP: ", err);
        }
    }

    /**
     * Decompress a `.tar.gz` file as an ArrayBuffer.
     * @param arrayBuffer
     * @param path
     * @returns -
     */
    private decompress(arrayBuffer: ArrayBuffer, path: string) {
        const gunzip = zlib.createGunzip();
        const extract = tar.extract({
            cwd: path
        });

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

    /**
     * @returns host architecture
     */
    private getArch() {
        if (process.platform === "darwin") {
            return "apple-darwin";
        } else if (process.platform === "linux") {
            return "unknown-linux-gnu";
        }
    }

    /**
     * @returns host platform
     */
    private getPlatform() {
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
    private getEndpointByOs(latestVersion: SemVer): string {
        const arch = this.getArch();
        const platform = this.getPlatform();

        if (!arch || !platform) {
            throw new Error("Invalid operating system for the LSP.");
        }

        return BINARIES_ENDPOINT + `/mz-lsp-server-v${latestVersion.format()}-${this.getPlatform()}-${this.getArch()}.tar.gz`;
    }

    /**
     * Returns the latest version number released.
     */
    private async fetchLatestVersionNumber() {
        console.log("[LSP]", "Fetching latest version number.");
        const response = await fetch(LATEST_VERSION_ENDPOINT);
        const latestVersion: string = await response.text();

        return new SemVer(latestVersion);
    }

    /**
     * Fetches the latest version of the LSP Server.
     * @returns the binary as an ArrayBuffer
     */
    private async fetchLsp(semVer?: SemVer): Promise<ArrayBuffer> {
        const latestVersion = semVer || await this.fetchLatestVersionNumber();
        const endpoint = this.getEndpointByOs(latestVersion);

        console.log("[LSP]", `Fetching LSP from: ${endpoint}`);
        const binaryResponse = await fetch(endpoint);
        const buffer = await binaryResponse.arrayBuffer();

        return buffer;
    }

    /**
     * Starts the LSP Client and checks for upgrades.
     * @param serverPath
     */
    private startClient() {
        console.log("[LSP]", "Starting the client.");

        // Build the options
        const run: Executable = {
            command: SERVER_PATH,
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
     * Checks and installs a newer version if it is available.
     */
    private async serverUpgradeIfAvailable(): Promise<SemVer | undefined> {
        try {
            if (this.client) {
                await this.client.onReady();
                const version = this.client.initializeResult?.serverInfo?.version;
                if (version) {
                    const installedSemVer = new SemVer(version);
                    const latestSemVer = new SemVer(await this.fetchLatestVersionNumber());

                    console.log("[LSP]", `Latest SemVer: ${latestSemVer} - Installed SemVer: ${installedSemVer}`);
                    if (latestSemVer > installedSemVer) {
                        console.log("[LSP]", "Newer version available.");
                        const tarballArrayBuffer = await this.fetchLsp(latestSemVer);
                        this.decompressAndInstallBinaries(tarballArrayBuffer);
                    } else {
                        console.log("[LSP]", "No newer version available.");
                    }
                }
            }
        } catch (err) {
            console.error("[LSP]", "Error upgrading the LSP server: ", err);
        }

        return undefined;
    }

    /**
     * The valid operating systems so far are MacOS (Darwin) ARM64 and Linux x64.
     * @returns true if it is one of both OS.
     */
    private isValidOs() {
        return this.getArch() !== undefined && this.getPlatform() !== undefined;
    }

    /**
     * Stops the LSP server client.
     * This is useful before installing an upgrade.
     */
    stop() {
        this.client && this.client.stop();
    }
}