import * as vscode from "vscode";
import { getNonce, getUri } from "../utilities/utils";
import { QueryResult } from "pg";

interface Results extends QueryResult {
    id: string,
    elapsedTime: number,
}

interface ResultsError {
    message: string,
    position?: number,
    query: string,
}

export default class ResultsProvider implements vscode.WebviewViewProvider {
    _view?: vscode.WebviewView;
    _doc?: vscode.TextDocument;

    // Identifies the identifier of the last query run by the user.
    // It is used to display the results and not overlap them from the results of a laggy query.
    private lastQueryId: string | undefined;

    // The provider can be invoked from `materialize.run`.
    // When this happens, the inner rendering script will not be ready
    // to listen changes. This variable holds the pending data to render
    // once the script is ready to listen.
    private pendingDataToRender: QueryResult<any> | undefined;

    // This variable indicates that the inner script is ready to listen
    // new data arriving and to render the information.
    private isScriptReady: boolean;

    constructor(private readonly _extensionUri: vscode.Uri) {
        this._extensionUri = _extensionUri;
        this.isScriptReady = false;
    }

    /**
     * Cleans the results and sets a latest query id.
     * @param id
     */
    public setQueryId(id: string) {
        this.lastQueryId = id;

        if (this._view) {
            console.log("[ResultsProvider]", "New query.");
            const thenable = this._view.webview.postMessage({ type: "newQuery" });
            thenable.then((posted) => {
                console.log("[ResultsProvider]", "Message posted: ", posted);
            });
        }
    }

    /**
     * Displays the results from the latest query.
     * @param id
     * @param queryResults
     */
    public setResults(id: string, results?: Results, error?: ResultsError) {
        console.log("[ResultsProvider]", "New query results.", this.lastQueryId);

        // Check if the results are from the last issued query.
        if (this._view && (this.lastQueryId === id || this.lastQueryId === undefined)) {
            console.log("[ResultsProvider]", "Is script ready : ", this.isScriptReady);
            if (this.isScriptReady) {

                if (results) {
                    const thenable = this._view.webview.postMessage({ type: "results", data: results });
                    thenable.then((posted) => {
                        console.log("[ResultsProvider]", "Message posted: ", posted);
                    });
                } else if (error) {
                    const thenable = this._view.webview.postMessage({ type: "results", data: { error } });
                    thenable.then((posted) => {
                        console.log("[ResultsProvider]", "Message posted: ", posted);
                    });
                }
            } else {
                console.log("[ResultsProvider]", "The script is not ready yet.");
                this.pendingDataToRender = results;
            }
        }
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
                case "ready": {
                    console.log("[ResultsProvider]", "The script is now ready.");
                    this.isScriptReady = true;

                    if (this.pendingDataToRender && this._view) {
                        console.log("[ResultsProvider]", "Sending pending data to the script.");
                        const thenable = this._view.webview.postMessage({ type: "results", data: this.pendingDataToRender });

                        thenable.then((posted) => {
                            console.log("[ResultsProvider]", "Message posted: ", posted);
                        });

                        this.pendingDataToRender = undefined;
                    }
                    break;
                }
            }
        });
    }

    public revive(panel: vscode.WebviewView) {
        this._view = panel;
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const scriptUri = getUri(webview, this._extensionUri, ["out", "scripts", "results.js"]);

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


            <title>Materialize Results</title>
        </head>
        <body>
            <div id="container"></div>
            <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
        </body>
        </html>`;
    }
}
