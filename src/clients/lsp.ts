import path from "path";
import {
    Executable,
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
} from "vscode-languageclient/node";

/// This class implements the Language Server Protocol client for Materialize.
/// The server must be inside `out/bin`.
export default class LspClient {
    private client: LanguageClient;

    constructor() {
        let serverPath: string;
        if (process.platform === 'win32') {
            serverPath = path.join(__dirname, 'bin', 'materialize-language-server');
        } else if (process.platform === 'darwin') {
            serverPath = path.join(__dirname, 'bin', 'materialize-language-server');
        } else {
            serverPath = path.join(__dirname, 'bin', 'materialize-language-server');
        }

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

    stop() {
        this.client.stop();
    }
}