import * as vscode from "vscode";
import { Request, Response, Application } from 'express';
import { Context, EventType } from "../context";
import { getUri } from "../utilities/getUri";
import AppPassword from "../context/AppPassword";

export interface Profile {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "app-password": String,
    region: String,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "admin-endpoint": String,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "cloud-endpoint": String,
}

export interface Config {
    profile: String;
    profiles: { [name: string] : Profile; }
}

export default class AuthProvider implements vscode.WebviewViewProvider {
    _view?: vscode.WebviewView;
    _doc?: vscode.TextDocument;
    context: Context;

    constructor(private readonly _extensionUri: vscode.Uri, context: Context) {
        this._extensionUri = _extensionUri;
        this.context = context;

        this.context.on("event", ({ type }) => {
            if (type === EventType.newProfiles) {
                console.log("[AuthProvider]", "New profiles available.");
                if (this._view) {
                    console.log("[AuthProvider]", "Posting new profiles.");
                    const profiles = this.context.getProfileNames();
                    const profile = this.context.getProfileName();

                    const thenable = this._view.webview.postMessage({ type: "newProfile", data: { profiles, profile } });
                    thenable.then((posted) => {
                        console.log("[AuthProvider]", "Message posted: ", posted);
                    });
                }
            }
        });
    }

    public resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;

        webviewView.webview.options = {
            // Allow scripts in the webview
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'out'), this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Listen for messages from the Sidebar component and execute action
        webviewView.webview.onDidReceiveMessage(async ({ data, type }) => {
            switch (type) {
                case "onLogin": {
                    const express = require('express');
                    const app: Application = express();

                    await new Promise((resolve, reject) => {
                        app.get('/', (req: Request, res: Response) => {
                            const {secret, clientId } = req.query;
                            // TODO: Handle any issue here removing casting.
                            this.context.addProfile("vscode", new AppPassword(clientId as string, secret as string), "aws/us-east-1");
                            res.send('You can now close the tab.');
                            resolve(true);
                        });

                        const server = app.listen(() => {
                            let serverAddress = server.address();
                            if (serverAddress !== null) {
                                const serverPort = typeof serverAddress === 'string' ? serverAddress : serverAddress.port;
                                vscode.env.openExternal(vscode.Uri.parse(`https://console.materialize.com/access/cli?redirectUri=http://localhost:${serverPort}`));
                            } else {
                                reject(new Error("Error assigning address to the server."));
                            }
                        });
                    });
                    break;
                }
                case "onProfileChange": {
                    const { name } = data;
                    console.log("[AuthProvider]", "onProfileChange(): ", data);
                    this.context.setProfile(name);
                    break;
                }
                case "onInfo": {
                    if (!data.value) {
                        return;
                    }
                    vscode.window.showInformationMessage(data.value);
                    break;
                }
                case "onError": {
                    if (!data.value) {
                        return;
                    }
                    vscode.window.showErrorMessage(data.value);
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
        const webviewUri = getUri(webview, this._extensionUri, ["out", "webview.js"]);
        const scriptUri = getUri(webview, this._extensionUri, ["media", "auth.js"]);
        const styleUri = getUri(webview, this._extensionUri, ["media", "style.css"]);

		// Use a nonce to only allow a specific script to be run.
		const nonce = getNonce();
        const profile = this.context.getProfile();

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
            <div id="profiles_container" class="dropdown-container">
                <div>
                    <label for="profiles">Profile</label>
                    <vscode-dropdown id="profiles">
                        ${(this.context.getProfileNames() || []).map((name) => `<vscode-option>${name}</vscode-option>`).join('')}
                    </vscode-dropdown>
                </div>
            </div>
            <vscode-button id="loginButton">Login</vscode-button>

            <script nonce="${nonce}" src="${scriptUri}"></script>
            <script type="module" nonce="${nonce}" src="${webviewUri}"></script>
        </body>
        </html>`;
    }
}

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}
