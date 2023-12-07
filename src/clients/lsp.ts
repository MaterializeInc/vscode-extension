/* eslint-disable @typescript-eslint/naming-convention */
import path from "path";
import * as vscode from "vscode";
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
import { Errors, ExtensionError } from "../utilities/error";
import * as Sentry from "@sentry/node";
import { fetchWithRetry } from "../utilities/utils";

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


/// Represents the structure a client uses to understand
export interface ExecuteCommandParseStatement {
    /// The sql content in the statement
    sql: string,
    /// The type of statement.
    /// Represents the String version of [Statement].
    kind?: string,
}

/// Represents the response from the parse command.
interface ExecuteCommandParseResponse {
    statements: Array<ExecuteCommandParseStatement>
}

/// Enum state for parsing until we can support WASM in the LSP.
enum State {
    Normal,
    InString,
    InLineComment,
    InDollarString,
    InBlockComment
}

/// This class implements the Language Server Protocol (LSP) client for Materialize.
/// The LSP is downloaded for an endpoint an it is out of the bundle. Binaries are heavy-weight
/// and is preferable to download on the first activation.
/// This is only the first approach and will evolve with time.
export default class LspClient {
    private isReady: Promise<boolean>;
    private client: LanguageClient | undefined;

    constructor() {
        this.isReady = new Promise((res, rej) => {
            const asyncOp = async () => {
                if (this.isValidOs()) {
                    if (!this.isInstalled()) {
                        try {
                            await this.installAndStartLspServer();
                            res(true);
                        } catch (err) {
                            Sentry.captureException(err);
                            rej(err);
                        }
                    } else {
                        console.log("[LSP]", "The server already exists.");
                        await this.startClient();
                        this.serverUpgradeIfAvailable();
                        res(true);
                    }
                } else {
                    console.error("[LSP]", "Invalid operating system.");
                    rej(new ExtensionError(Errors.invalidOS, "Invalid operating system."));
                    Sentry.captureException(new ExtensionError(Errors.invalidOS, "Invalid operating system."));
                    return;
                }
            };

            asyncOp();
        });
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
            await this.startClient();
        } catch (err) {
            console.error("[LSP]", "Error fetching the LSP: ", err);
            throw new ExtensionError(Errors.lspInstallFailure, err);
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
                .on('finish', () => {
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
        const response = await fetchWithRetry(LATEST_VERSION_ENDPOINT);
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
        const binaryResponse = await fetchWithRetry(endpoint);
        const buffer = await binaryResponse.arrayBuffer();

        return buffer;
    }

    /**
     * Listens to configuration changes in VS Code.
     * If it is related to the formatting width,
     * it will restart the LSP to use the new value.
     */
    private listenConfigurationChanges() {
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('materialize.formattingWidth')) {
                console.log("[LSP]", "Formatting width has changed.");

                // Restart client.
                if (this.client) {
                    this.client.onReady().then(() => {
                        this.stop();
                        this.startClient();
                    }).catch(() => {
                        console.error("[LSP]", "Error restarting client.");
                    });
                }
            }
        });
    }

    /**
     * Starts the LSP Client and checks for upgrades.
     * @param serverPath
     */
    private async startClient() {
        console.log("[LSP]", "Starting the client.");

        // Build the options
        const run: Executable = {
            command: SERVER_PATH,
        };
        const serverOptions: ServerOptions = {
            run,
            debug: run,
        };
        const configuration = vscode.workspace.getConfiguration('materialize');
        const formattingWidth = configuration.get('formattingWidth');
        console.log("[LSP]", "Formatting width: ", formattingWidth);
        const clientOptions: LanguageClientOptions = {
            documentSelector: [{ scheme: "file", language: "mzsql"}],
            initializationOptions: {
                formattingWidth,
            }
        };

        // Create the language client and start the client.
        this.client = new LanguageClient("materialize-language-server", "Materialize language server", serverOptions, clientOptions);
        this.client.start();

        try {
            await this.client.onReady();
            this.listenConfigurationChanges();
        } catch (err) {
            console.error("[LSP]", "Error waiting onReady(): ", err);
            Sentry.captureException(err);
            throw new ExtensionError(Errors.lspOnReadyFailure, err);
        }
    }

    /**
     * Checks and installs a newer version if it is available.
     */
    private async serverUpgradeIfAvailable(): Promise<SemVer | undefined> {
        try {
            if (this.client) {
                await this.client.onReady();
                const version = this.client.initializeResult?.serverInfo?.version;
                console.log("[LSP]", "Initialize result: ", this.client.initializeResult);
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
            Sentry.captureException(new ExtensionError(Errors.lspInstallFailure, err));
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

    /**
     * Sends a request to the LSP server to execute the parse command.
     * The parse command returns the list of statements in an array,
     * including their corresponding SQL and type (e.g., select, create_table, etc.).
     *
     * If there is an issue processing the SQL query using the LSP,
     * such as an incompatible OS, inability to download, or other issues,
     * we use a less sophisticated local parser to make it possible to run
     * simple queries.
     *
     * TODO: This behavior should be removed after having the LSP
     * compiled in WASM: https://github.com/MaterializeInc/materialize/issues/23101
     *
     * For more information about LSP commands: https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#workspace_executeCommand
     */
    async parseSql(sql: string, useAlternativeParse?: boolean): Promise<Array<ExecuteCommandParseStatement>> {
        // This is only useful for testing purposes.
        if (useAlternativeParse) {
            try {
                return this.alternativeParser(sql);
            } catch (err) {
                Sentry.captureException(err);
                throw new ExtensionError(Errors.parsingFailure, "Error parsing the statements.");
            }
        }

        try {
            await this.isReady;

            if (this.client) {
                try {
                    // Send request
                    const { statements } = await this.client.sendRequest("workspace/executeCommand", { command: "parse", arguments: [
                        sql
                    ]}) as ExecuteCommandParseResponse;

                    return statements;
                } catch (err) {
                    throw new ExtensionError(Errors.lspCommandFailure, err);
                }
            } else {
                throw new ExtensionError(Errors.lspClientFailure, "Error processing request in the LSP.");
            }
        } catch (err) {
            const parsingError = "Error parsing the statements.";
            console.error("[LSP]", (err && (err as any).message));
            if (parsingError === (err instanceof Error && err.message)) {
                throw new ExtensionError(Errors.parsingFailure, "Syntax errors present in your query.");
            } else {
                console.warn("[LSP]", "Using alternative parser, an error raised using the LSP: ", err);
                try {
                    return this.alternativeParser(sql);
                } catch (err) {
                    throw new ExtensionError(Errors.parsingFailure, "Error parsing the statements.");
                }
            }
        }
    }

    /**
     * Simple SQL parser for statements.
     *
     * It takes a SQL containing multiple statements,
     * and returns each statement as an element in an array.
     *
     * @param {string} sql
     * @returns {Array<ExecuteCommandParseStatement>} array of statements
     */
    private alternativeParser(sql: string): Array<ExecuteCommandParseStatement> {
        let state: State = State.Normal;
        let dollarQuoteTag = '';
        let currentStatement = '';
        const statements: Array<ExecuteCommandParseStatement> = [];

        for (let i = 0; i < sql.length; i++) {
            const char = sql[i];
            const lookahead = sql.substring(i);

            switch (state) {
                case State.Normal:
                    if (char === '\'') {
                        state = State.InString;
                    }
                    else if (lookahead.startsWith('--')) {
                        state = State.InLineComment;
                    }
                    else if (lookahead.startsWith('/*')) {
                        state = State.InBlockComment;
                        i++;
                    } else if (char === '$') {
                        // Detecting start of dollar-quoted string
                        const match = lookahead.match(/^\$([A-Za-z0-9_]*)\$/);
                        if (match) {
                            dollarQuoteTag = match[0];
                            state = State.InDollarString;
                            i += dollarQuoteTag.length - 1;
                        }
                    }
                    break;
                case State.InString:
                    if (char === '\'' && sql[i - 1] !== '\\') {
                        state = State.Normal;
                    }
                    break;
                case State.InLineComment:
                    if (char === '\n') {
                        state = State.Normal;
                    }
                    break;
                case State.InBlockComment:
                    if (lookahead.startsWith('*/')) {
                        state = State.Normal;
                        i++;
                    }
                    break;
                case State.InDollarString:
                    if (lookahead.startsWith(dollarQuoteTag)) {
                        state = State.Normal;
                        i += dollarQuoteTag.length - 1;
                    }
                    break;
            }

            // Boundary
            if (char === ';' && state === State.Normal) {
                statements.push({
                    sql: currentStatement.trim()
                });
                currentStatement = '';
            } else {
                currentStatement += char;
            }
        }

        if (currentStatement.trim()) {
            statements.push({
                sql: currentStatement.trim(),
            });
        }

        return statements;
    }
}
