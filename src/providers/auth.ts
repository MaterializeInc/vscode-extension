import * as vscode from "vscode";
import { Request, Response, Application } from 'express';
import { Context, EventType } from "../context";
import { getUri } from "../utilities/getUri";
import AppPassword from "../context/appPassword";
import { getNonce } from "../utilities/getNonce";

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
    isRemoveProfile: boolean;
    isAddNewProfile: boolean;
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
    context: Context;
    state: State;

    constructor(private readonly _extensionUri: vscode.Uri, context: Context) {
        this._extensionUri = _extensionUri;
        this.context = context;
        this.state = {
            isAddNewProfile: false,
            isRemoveProfile: false,
            isLoading: this.context.isLoading(),
            error: undefined,
        };

        // Await for readyness when the extension activates from the outside.
        // E.g. Running a query without opening the extension.
        this.context.waitReadyness().then(() => {
            this.state = {
                ...this.state,
                isLoading: false,
                error: undefined,
            };
        });

        this.context.on("event", (data) => {
            const { type } = data;
            switch (type) {
                case EventType.error: {
                    const { message } = data;
                    console.log("[AuthProvider]", "Error detected: ", message, data);
                    this.state.error = message;
                    this.state.isLoading = false;

                    // if (this._view) {
                    //     this._view.webview.html = this._getHtmlForWebview(this._view.webview);
                    // }
                    break;
                }
                case EventType.newProfiles: {
                    console.log("[AuthProvider]", "New profiles available.");
                    if (this._view) {
                        console.log("[AuthProvider]", "Posting new profiles.");
                        const profilesNames = this.context.getProfileNames();
                        const profileName = this.context.getProfileName();

                        const thenable = this._view.webview.postMessage({ type: "newProfile", data: { profilesNames, profileName } });
                        thenable.then((posted) => {
                            console.log("[AuthProvider]", "Profiles message posted: ", posted);
                        });
                    }
                    break;
                }

                case EventType.environmentChange: {
                    console.log("[AuthProvider]", "Environment change.");
                    if (this._view) {
                        const thenable = this._view.webview.postMessage({ type: "environmentChange" });
                        thenable.then((posted) => {
                            console.log("[AuthProvider]", "Environment change message posted: ", posted);
                        });
                    }
                    break;
                }

                case EventType.environmentLoaded: {
                    console.log("[AuthProvider]", "New environment available.");
                    if (this._view) {
                        this.state.isLoading = false;
                        this.state.error = undefined;

                        // Do not refresh the webview if the user is removing or adding a profile.
                        // The UI will auto update after this action ends.
                        if (this.state.isRemoveProfile || this.state.isAddNewProfile) {
                            return;
                        }
                        console.log("[AuthProvider]", "Triggering configuration webview.");
                        const thenable = this._view.webview.postMessage("hey");
                        // this._view.webview.html = this._getHtmlForWebview(this._view.webview);
                    }
                    break;
                }
                default:
                    break;
            }
        });
    }

    /**
     * Checks if the app password response from the console is ok.
     * @param appPasswordResponse App password response from the console
     * @param name name of the profile.
     * @param webviewView webview of the provider.
     */
    checkLoginServerResponse(
        appPasswordResponse: AppPasswordResponse | undefined,
        name: string,
        webviewView: vscode.WebviewView
    ) {
        this.state.isAddNewProfile = false;
        this.state.error = undefined;

        if (appPasswordResponse) {
            const { appPassword, region } = appPasswordResponse;

            // Set the state loading to true. After the new context is loaded
            // loading will turn false.
            this.state.isLoading = true;
            this.context.addAndSaveProfile(name, appPassword, region.toString());
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
        webviewView.webview.postMessage("Hello");

        // Listen for messages from the Sidebar component and execute action
        webviewView.webview.onDidReceiveMessage(async ({ data, type }) => {
            console.log("[AuthProvider]", "onDidReceiveMessage", type);
            switch (type) {
                case "requestContextState": {
                    console.log("[AuthProvider]", "Context state request.", );
                    if (this._view) {
                        console.log("[AuthProvider]", "Posting context state.");
                        const profilesNames = this.context.getProfileNames();
                        const profileName = this.context.getProfileName();

                        const thenable = this._view.webview.postMessage({ type: "contextState", data: { profilesNames, profileName } });
                        thenable.then((posted) => {
                            console.log("[AuthProvider]", "Context state message posted: ", posted);
                        });
                    }
                    break;
                }
                case "onLogin": {
                    const { name } = data;

                    // webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
                    loginServer(name).then((appPasswordResponse) => {
                        this.checkLoginServerResponse(appPasswordResponse, name, webviewView);
                    }).catch((err) => {
                        console.error("Error setting up the server: ", err);
                        vscode.window.showErrorMessage('Internal error while waiting for the credentials.');
                    });
                    break;
                }
                case "onContinueProfile": {
                    const { name } = data;
                    loginServer(name).then((appPasswordResponse) => {
                        this.checkLoginServerResponse(appPasswordResponse, name, webviewView);
                    }).finally(() => {
                        this.state.isAddNewProfile = false;
                        // webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
                    });
                    break;
                }
                case "onCancelAddProfile": {
                    this.state.isAddNewProfile = false;
                    // webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
                    break;
                }
                case "onAddProfile": {
                    this.state.isAddNewProfile = true;
                    // webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
                    break;
                }
                case "onProfileChange": {
                    const { name } = data;
                    console.log("[AuthProvider]", "onProfileChange(): ", data);
                    this.context.setProfile(name);
                    break;
                }
                // Remove Profile:
                case "onCancelRemoveProfile": {
                    this.state.isRemoveProfile = false;
                    // webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
                    break;
                }
                case "onContinueRemoveProfile": {
                    this.state.isRemoveProfile = false;

                    // Set the state loading to true. After the new context is loaded
                    // loading will turn false.
                    this.state.isLoading = true;
                    // webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

                    const name = this.context.getProfileName();

                    if (name) {
                        this.context.removeAndSaveProfile(name);
                    } else {
                        console.error("[Auth]", "Profile name is not available.");
                    }

                    break;
                }
                case "onRemoveProfile": {
                    this.state.isRemoveProfile = true;
                    // webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
                    break;
                }
                case "logInfo": {
                    const { messages } = data;
                    if (!messages) {
                        return;
                    }
                    this._view?.webview.postMessage("JA");
                    console.log("[Auth/React]", messages);
                    break;
                }
                case "logError": {
                    const { error } = data;
                    if (!error) {
                        return;
                    }
                    console.error("[Auth/React]", error);
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
        const nonce = getNonce();
        console.log("[Auth]", "_getHtmlForWebview", webview.cspSource);

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body>
            <div id="root">This is a comment!</div>
            <script nonce="${nonce}" src="${scriptUri}"></script>
        </body>
        </html>`;
    }
};
