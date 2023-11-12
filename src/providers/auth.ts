import * as vscode from "vscode";
import { Request, Response, Application } from 'express';
import { getUri } from "../utilities/getUri";
import AppPassword from "../context/appPassword";
import { getNonce } from "../utilities/getNonce";
import AsyncContext from "../context/asyncContext";

// Please update this link if the logo location changes in the future.
const LOGO_URL: String = "https://materialize.com/svgs/brand-guide/materialize-purple-mark.svg";

/**
 * Returns a proper HTML webpage to render the response in the browser.
 * @param output
 * @returns
 */
function formatOutput(output: String): String {
    return `
        <body style="margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background-color: #f0f0f0;">
            <div style="text-align: center; padding: 100px; background-color: #ffffff; border-radius: 10px; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);">
                <img src="${LOGO_URL}" alt="logo">
                <h2 style="padding-top: 20px; font-family: Inter, Arial, sans-serif;">${output}</h2>
            </div>
        </body>
    `;
}

interface AppPasswordResponse {
    appPassword: AppPassword,
    region: string;
}

/**
 * Creates an express server to await the request from the browser.
 * @returns the app-password or nothing if the user cancels the action.
 */
async function loginServer(name: string): Promise<AppPasswordResponse | undefined> {
    const express = require('express');
    const app: Application = express();

    return await new Promise((resolve, reject) => {
        app.get('/', (req: Request, res: Response) => {
            const {secret, clientId, region } = req.query;
            res.send(formatOutput('You can now close the tab.'));

            if (secret && clientId && region) {
                resolve({
                    appPassword: new AppPassword(clientId as string, secret as string),
                    region: new String(region).toLowerCase()
                });
            }
        });

        const server = app.listen(() => {
            let serverAddress = server.address();
            if (serverAddress !== null) {
                const serverPort = typeof serverAddress === 'string' ? serverAddress : serverAddress.port;
                vscode.env.openExternal(vscode.Uri.parse(`https://console.materialize.com/access/cli?redirectUri=http://localhost:${serverPort}&tokenDescription=${name}`));
            } else {
                reject(new Error("Error assigning address to the server."));
            }
        });
    });
}

interface State {
    isLoading: boolean;
    error: undefined | string;
}

/**
 * The AuthProvider is in charge of rendering the login section.
 * Also enables the user to choose the database, schema or cluster.
 *
 * All the information is stored in the same path as the mz CLI,
 * creating sinergy in the development experience.
 */
export default class AuthProvider implements vscode.WebviewViewProvider {
    _view?: vscode.WebviewView;
    _doc?: vscode.TextDocument;
    context: AsyncContext;
    state: State;

    constructor(private readonly _extensionUri: vscode.Uri, context: AsyncContext) {
        this._extensionUri = _extensionUri;
        this.context = context;
        this.state = {
            isLoading: this.context.isLoading(),
            error: undefined,
        };

        // Await for readyness when the extension activates from the outside.
        // E.g. Running a query without opening the extension.
        this.context.isReady().then(() => {
            this.updateState({
                ...this.state,
                isLoading: false,
                error: undefined
            });
        });
    }

    private publishState() {
        console.log("[AuthProvider]", "Posting context state.");
        this.context.isReady().finally(() => {
            if (this._view) {
                const profileNames = this.context.getProfileNames();
                const profileName = this.context.getProfileName();
                const thenable = this._view.webview.postMessage(JSON.stringify({ type: "contextState", data: {
                    profileNames,
                    profileName,
                    environment: this.context.getEnvironment(),
                }}));
                thenable.then((posted) => {
                    console.log("[AuthProvider]", "Context state message posted: ", posted);
                });
            }
        });
    }

    private updateState(state: State) {
        this.state = state;
    }

    private capitalizeFirstLetter(str: string) {
        if (typeof str !== "string") {
            return;
        }
        if (str.length === 0) {
          return str;
        }

        const firstChar = str.charAt(0);
        const capitalized = firstChar.toUpperCase() + str.slice(1);

        return capitalized;
    };

    async displayError(message: string) {
        console.log("[AuthProvider]", "Error detected: ", message);
        this.updateState({
            ...this.state,
            error: this.capitalizeFirstLetter(message),
            isLoading: false,
        });
    }

    async environmentChange() {
        console.log("[AuthProvider]", "Environment change.");
        this.state.isLoading = true;
        this.state.error = undefined;

        if (this._view) {
            const thenable = this._view.webview.postMessage({ type: "environmentChange" });
            thenable.then((posted) => {
                console.log("[AuthProvider]", "Environment change message posted: ", posted);
            });
        }
    }

    async environmentLoaded() {
        console.log("[AuthProvider]", "New environment available.");
        if (this._view) {
            // Do not refresh the webview if the user is removing or adding a profile.
            // The UI will auto update after this action ends.
            this.updateState({
                ...this.state,
                isLoading: true,
            });
        }
    }

    /**
     * Checks if the app password response from the console is ok.
     * @param appPasswordResponse App password response from the console
     * @param name name of the profile.
     * @param webviewView webview of the provider.
     */
    async checkLoginServerResponse(
        appPasswordResponse: AppPasswordResponse | undefined,
        name: string
    ) {
        this.updateState({
            ...this.state,
            error: undefined,
            isLoading: true,
        });

        if (appPasswordResponse) {
            const { appPassword, region } = appPasswordResponse;
            await this.context.addAndSaveProfile(name, appPassword, region.toString());
        } else {
            // Cancel login process.
            // webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        }
    }

    public resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;

        webviewView.webview.options = {
            // Allow scripts in the webview
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'out'), this._extensionUri]
        };

        console.log("[Auth]", "resolveWebviewView()");
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Listen for messages from the Sidebar component and execute action
        webviewView.webview.onDidReceiveMessage(async (message) => {
            console.log("[AuthProvider]", "Receive message: ", message);
            const { data, type } = typeof message === "string" ? JSON.parse(message) as any : message;
            console.log("Received message type: ", type);
            switch (type) {
                case "contextState": {
                    console.log("[AuthProvider]", "Context state request.", );
                    if (this._view) {
                        this.publishState();
                    }
                    break;
                }
                case "onAddProfile": {
                    const { name } = data;

                    loginServer(name).then((appPasswordResponse) => {
                        this.checkLoginServerResponse(appPasswordResponse, name).then(() => {

                        });
                    }).catch((err) => {
                        console.error("Error setting up the server: ", err);
                        vscode.window.showErrorMessage('Internal error while waiting for the credentials.');

                    });
                    break;
                }
                case "onProfileChange": {
                    const { name } = data;
                    console.log("[AuthProvider]", "onProfileChange(): ", data);
                    this.context.setProfile(name);
                    break;
                }
                case "onRemoveProfile": {
                    // Set the state loading to true. After the new context is loaded
                    // loading will turn false.
                    this.state.isLoading = true;

                    const name = this.context.getProfileName();

                    if (name) {
                        await this.context.removeAndSaveProfile(name);
                    } else {
                        console.error("[Auth]", "Profile name is not available.");
                    }

                    break;
                }
                case "logInfo": {
                    const { messages } = data;
                    if (!messages) {
                        return;
                    }
                    console.log("[AuthProvider]", "logInfo: ", messages);
                    break;
                }
                case "logError": {
                    const { error } = data;
                    if (!error) {
                        return;
                    }
                    console.error("[AuthProvider]", "logError: ", error);
                    break;
                }
                case "onConfigChange": {
                    const { name, type } = data;
                    console.log("[AuthProvider]", "onConfigChange(): ", data);

                    switch (type) {
                        case "databases":
                            this.context.setDatabase(name);
                            break;

                        case "clusters":
                            this.context.setCluster(name);
                            break;

                        case "schemas":
                            this.context.setSchema(name);
                            break;
                        default:
                            break;
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
		// Do the same for the stylesheet.
        const scriptUri = getUri(webview, this._extensionUri, ["out", "scripts", "index.js"]);
        const styleUri = getUri(webview, this._extensionUri, ["resources", "style.css"]);
        const nonce = getNonce();
        console.log("[Auth]", "_getHtmlForWebview", webview.cspSource);

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="${styleUri}" rel="stylesheet">
        </head>
        <body>
            <div id="root"></div>
            <script nonce="${nonce}" src="${scriptUri}"></script>
        </body>
        </html>`;
    }
};
