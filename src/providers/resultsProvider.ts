import * as vscode from "vscode";
import { Context } from "../context";
import { EventType } from "../context/context";
import { getUri } from "../utilities/getUri";
import { getNonce } from "../utilities/getNonce";

export default class ResultsProvider implements vscode.WebviewViewProvider {
    _view?: vscode.WebviewView;
    _doc?: vscode.TextDocument;
    private context: Context;

    constructor(private readonly _extensionUri: vscode.Uri, context: Context) {
        this._extensionUri = _extensionUri;
        this.context = context;

        this.context.on("event", ({ type, data }) => {
            if (type === EventType.queryResults) {
                console.log("[ResultsProvider]", "New query results.");
                if (this._view) {
                    console.log("[ResultsProvider]", "Posting results.");
                    const thenable = this._view.webview.postMessage({ type: "results", data });
                    thenable.then((posted) => {
                        console.log("[ResultsProvider]", "Message posted: ", posted);
                    });
                }
            }
        });
    }

    public resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Listen for messages from the Sidebar component and execute action
        webviewView.webview.onDidReceiveMessage(async ({ data, type }) => {
            console.log("[ResultsProvider]", "Received a new message: ", data, type);
            switch (type) {
                case "logInfo": {
                    const { messages } = data;
                    if (!messages) {
                        return;
                    }
                    console.log("[ResultsProvider]", messages);
                    break;
                }
                case "logError": {
                    const { error } = data;
                    if (!error) {
                        return;
                    }
                    console.error("[ResultsProvider]", error);
                    break;
                }
            }
        });
    }

    public revive(panel: vscode.WebviewView) {
        this._view = panel;
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const webviewUri = getUri(webview, this._extensionUri, ["out", "webview.js"]);
        const scriptUri = getUri(webview, this._extensionUri, ["media", "results.js"]);
        const styleUri = getUri(webview, this._extensionUri, ["media", "style.css"]);

		// Use a nonce to only allow a specific script to be run.
		const nonce = getNonce();

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">

            <!--
                Use a content security policy to only allow loading styles from our extension directory,
                and only allow scripts that have a specific nonce.
                (See the 'webview-sample' extension sample for img-src content security policy examples)
            -->
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">

            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="${styleUri}" rel="stylesheet">

            <title>Materialize Auth</title>
        </head>
        <body>
            <div id="container"></div>
            <script nonce="${nonce}" src="${scriptUri}"></script>
            <script type="module" nonce="${nonce}" src="${webviewUri}"></script>
        </body>
        </html>`;
    }
}