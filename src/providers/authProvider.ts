import * as vscode from "vscode";
import { Request, Response, Application } from 'express';
import { Context, EventType } from "../context";
import { getUri } from "../utilities/getUri";
import AppPassword from "../context/AppPassword";
import { getNonce } from "../utilities/getNonce";

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

async function loginServer(): Promise<AppPassword> {
    const express = require('express');
    const app: Application = express();

    return await new Promise((resolve, reject) => {
        app.get('/', (req: Request, res: Response) => {
            const {secret, clientId } = req.query;
            // TODO: Handle any issue or cancel here removing casting.
            res.send('You can now close the tab.');
            resolve(new AppPassword(clientId as string, secret as string));
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
}

interface State {
    isAddNewProfile: boolean;
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
        };

        this.context.on("event", ({ type }) => {
            switch (type) {
                case EventType.newProfiles: {
                    console.log("[AuthProvider]", "New profiles available.");
                    if (this._view) {
                        console.log("[AuthProvider]", "Posting new profiles.");
                        const profiles = this.context.getProfileNames();
                        const profile = this.context.getProfileName();

                        const thenable = this._view.webview.postMessage({ type: "newProfile", data: { profiles, profile } });
                        thenable.then((posted) => {
                            console.log("[AuthProvider]", "Profiles message posted: ", posted);
                        });
                    }
                    break;
                }

                case EventType.newClusters: {
                    console.log("[AuthProvider]", "New clusters available.");
                    if (this._view) {
                        console.log("[AuthProvider]", "Posting new clusters.");
                        const clusters = this.context.getClusters();
                        const cluster = this.context.getCluster();

                        const thenable = this._view.webview.postMessage({ type: "newClusters", data: { clusters, cluster } });
                        thenable.then((posted) => {
                            console.log("[AuthProvider]", "Clusters message posted: ", posted);
                        });
                    }
                    break;
                }
                default:
                    break;
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
            console.log("[AuthProvider]", type);
            switch (type) {
                case "onLogin": {
                    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
                    // TODO: Handle Err
                    loginServer().then((appPassword) => {
                        this.context.addProfile("vscode", appPassword, "aws/us-east-1");
                    });
                    break;
                }
                case "onAddProfileConfirmed": {
                    const { name } = data;
                    // TODO: Handle Err
                    loginServer().then((appPassword) => {
                        this.state.isAddNewProfile = false;
                        this.context.addProfile(name, appPassword, "aws/us-east-1");
                    }).finally(() => {
                        this.state.isAddNewProfile = false;
                        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
                    });
                    break;
                }
                case "onCancelAddProfile": {
                    this.state.isAddNewProfile = false;
                    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
                    break;
                }

                case "onAddProfile": {
                    this.state.isAddNewProfile = true;
                    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
                    break;
                }
                case "onProfileChange": {
                    const { name } = data;
                    console.log("[AuthProvider]", "onProfileChange(): ", data);
                    this.context.setProfile(name);
                    break;
                }
                case "logInfo": {
                    const { messages } = data;
                    if (!messages) {
                        return;
                    }
                    console.log("[AuthProvider]", messages);
                    break;
                }
                case "logError": {
                    const { error } = data;
                    if (!error) {
                        return;
                    }
                    console.error("[AuthProvider]", error);
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
        const logoUri = getUri(webview, this._extensionUri, ["media", "logo.svg"]);

		// Use a nonce to only allow a specific script to be run.
		const nonce = getNonce();

        let content = (
            `<div>
                <vscode-button id="loginButton">Login</vscode-button>
            </div>`
        );
        const profileNames = this.context.getProfileNames();

        console.log("[AuthProvider]", this.state, profileNames);
        if (profileNames) {
            if (this.state.isAddNewProfile) {
                content = (
                    `<div id="profile-setup-container">
                        <label for="profileNameInput">Name</label>
                        <input id="profileNameInput"></input>
                    </div>
                    </div>
                    <div id="add-profile-actions-container">
                        <vscode-button id="cancelAddProfile">Cancel</vscode-button>
                        <vscode-button id="addProfileButton">Add</vscode-button>
                    </div>`
                );
            } else {
                content = (
                    `<div id="setup-container">
                        <div id="profile-setup-container">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" width="24" height="24" stroke-width="1.5" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <vscode-dropdown id="profiles">
                                ${(this.context.getProfileNames() || []).map((name) => `<vscode-option>${name}</vscode-option>`).join('')}
                            </vscode-dropdown>

                            <vscode-button id="addProfileLink">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
                                </svg>
                            </vscode-button>
                        </div>
                        <div id="cluster-setup-container">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g><path d="M7.99967 1.33313L1.33301 4.66646L7.99967 7.9998L14.6663 4.66646L7.99967 1.33313Z" stroke="currentColor" stroke-width="1.33333" stroke-linecap="round" stroke-linejoin="round"></path><path d="M1.33301 11.3331L7.99967 14.6665L14.6663 11.3331" stroke="currentColor" stroke-width="1.33333" stroke-linecap="round" stroke-linejoin="round"></path><path d="M1.33301 7.99988L7.99967 11.3332L14.6663 7.99988" stroke="currentColor" stroke-width="1.33333" stroke-linecap="round" stroke-linejoin="round"></path></g></svg>
                            <vscode-dropdown id="clusters">
                                ${(this.context.getClusters()).map((name) => `<vscode-option>${name}</vscode-option>`).join('')}
                            </vscode-dropdown>
                        </div>
                    </div>`
                );
            }
        }



        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">

            <!--
                Use a content security policy to only allow loading styles from our extension directory,
                and only allow scripts that have a specific nonce.
                (See the 'webview-sample' extension sample for img-src content secsurity policy examples)
            -->
            <meta
            http-equiv="Content-Security-Policy"
            content="default-src 'none'; img-src ${webview.cspSource} https:; script-src ${webview.cspSource}; style-src ${webview.cspSource};"
            />
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="${styleUri}" rel="stylesheet">

            <title>Materialize Auth</title>
        </head>
        <body>
            <div id="container">
                <img id="logo" src="${logoUri}" alt="Materialize Logo" />
                ${content}
            </div>

            <script nonce="${nonce}" src="${scriptUri}"></script>
            <script type="module" nonce="${nonce}" src="${webviewUri}"></script>
        </body>
        </html>`;
    }
}
