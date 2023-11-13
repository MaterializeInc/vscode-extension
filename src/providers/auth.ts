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

    constructor(private readonly _extensionUri: vscode.Uri, context: AsyncContext) {
        this._extensionUri = _extensionUri;
        this.context = context;
    }

    private publish(type: string, data: any) {
        if (this._view) {
            const { error } = data;
            if (error) {
                data.error = error.message;
            }
            const thenable = this._view.webview.postMessage(JSON.stringify({ type, data}));
            thenable.then((posted) => {
                console.log("[AuthProvider]", "Context state message posted: ", posted);
            });
        }
    }

    private async getContext() {
        let error;

        try {
            await this.context.isReady();
        } catch (err) {
            console.error("[AuthProvider]", "Error awaiting context.");
            error = err;
        }

        return {
            profileNames: this.context.getProfileNames(),
            profileName: this.context.getProfileName(),
            environment: this.context.getEnvironment(),
            error,
        };
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
            switch (type) {
                case "getContext": {
                    console.log("[AuthProvider]", "Context state request.", );
                    if (this._view) {
                        try {
                            const context = await this.getContext();
                            console.log("[Auth]", "Publishing context: ", context);
                            this.publish("getContext", context);
                        } catch (err) {
                            // TODO: Implement.
                        }
                    }
                    break;
                }
                case "onAddProfile": {
                    const { name } = data;

                    loginServer(name).then((appPasswordResponse) => {
                        this.checkLoginServerResponse(appPasswordResponse, name).finally(async () => {
                            this.publish("onAddProfile", await this.getContext());
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
                    try {
                        await this.context.setProfile(name);
                    } finally {
                        console.log("[AuthProvider]", "Env: ", this.context.getEnvironment());
                        this.publish("onProfileChange", await this.getContext());
                    }
                    break;
                }
                case "onRemoveProfile": {
                    // Set the state loading to true. After the new context is loaded
                    // loading will turn false.
                    const name = this.context.getProfileName();

                    try {
                        if (name) {
                                await this.context.removeAndSaveProfile(name);
                        } else {
                            console.error("[Auth]", "Profile name is not available.");
                        }
                    } finally {
                        console.log("[AuthProvider]", "Env: ", this.context.getEnvironment());
                        this.publish("onRemoveProfile", await this.getContext());
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
                        case "database":
                            try {
                                await this.context.setDatabase(name);
                            } finally {
                                console.log("[AuthProvider]", "Env: ", this.context.getEnvironment());
                                this.publish("onConfigChange", await this.getContext());
                            }
                            break;

                        case "cluster":
                            try {
                                await this.context.setCluster(name);
                            } finally {
                                console.log("[AuthProvider]", "Env: ", this.context.getEnvironment());
                                this.publish("onConfigChange", await this.getContext());
                            }
                            break;

                        case "schema":
                            try {
                                await this.context.setSchema(name);
                            } finally {
                                console.log("[AuthProvider]", "Env: ", this.context.getEnvironment());
                                this.publish("onConfigChange", await this.getContext());
                            }
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
