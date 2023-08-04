import * as vscode from "vscode";
import { Request, Response, Application } from 'express';
import { Context, EventType } from "../context";
import { getUri } from "../utilities/getUri";
import AppPassword from "../context/appPassword";
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

async function loginServer(): Promise<AppPassword | undefined> {
    const express = require('express');
    const app: Application = express();

    return await new Promise((resolve, reject) => {
        app.get('/', (req: Request, res: Response) => {
            const {secret, clientId } = req.query;
            res.send('You can now close the tab.');

            if (secret && clientId) {
                resolve(new AppPassword(clientId as string, secret as string));
            }
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
    isLoading: boolean;
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
            isLoading: true,
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

                        console.log("[AuthProvider]", "Triggering configuration webview.");
                        this._view.webview.html = this._getHtmlForWebview(this._view.webview);
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
                    const { name } = data;

                    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
                    loginServer().then((appPassword) => {
                        this.state.isAddNewProfile = false;
                        if (appPassword) {
                            this.context.addAndSaveProfile(name, appPassword, "aws/us-east-1");
                        } else {
                            // Cancel login process.
                            webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
                        }
                    }).catch((err) => {
                        console.error("Error setting up the server: ", err);
                        vscode.window.showErrorMessage('Internal error while waiting for the credentials.');
                    });
                    break;
                }
                case "onContinueProfile": {
                    const { name } = data;
                    loginServer().then((appPassword) => {
                        this.state.isAddNewProfile = false;
                        if (appPassword) {
                            this.context.addAndSaveProfile(name, appPassword, "aws/us-east-1");
                        } else {
                            // Cancel login process.
                            webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
                        }
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
        const webviewUri = getUri(webview, this._extensionUri, ["out", "webview", "index.js"]);
        const scriptUri = getUri(webview, this._extensionUri, ["out", "scripts", "auth.js"]);
        const styleUri = getUri(webview, this._extensionUri, ["resources", "style.css"]);

        const config = vscode.workspace.getConfiguration('workbench');
        const currentTheme = config.get<string>('colorTheme');
        const logoUri = getUri(webview, this._extensionUri, ["resources", currentTheme?.includes('Dark') ? "logo.png" : "logo_color.png"]);

		// Use a nonce to only allow a specific script to be run.
		const nonce = getNonce();

        let content = (
            `<div id="profile-setup-container">
                <vscode-text-field id="profileNameInput">Profile Name</vscode-text-field>
            </div>
            <div id="add-profile-actions-container">
                <vscode-button id="continueProfileButton" disabled=true>Continue</vscode-button>
            </div>
            `
        );
        const profileNames = this.context.getProfileNames();

        console.log("[AuthProvider]", this.state, profileNames);
        if (profileNames) {
            if (this.state.isAddNewProfile) {
                content = (
                    `<div id="profile-setup-container">
                        <vscode-text-field id="profileNameInput">Profile Name</vscode-text-field>
                    </div>
                    <div id="add-profile-actions-container">
                        <vscode-button id="cancelAddProfile">Cancel</vscode-button>
                        <vscode-button id="continueProfileButton"
                        disabled=true>Continue</vscode-button>
                    </div>`
                );
            } else {
                const database = this.context.getDatabase();
                const schema = this.context.getSchema();
                const cluster = this.context.getCluster();
                const profileName = this.context.getProfileName();

                content = (
                    `<div class="profile-container">
                        <div class="setup-container">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" width="20" height="20" stroke-width="1" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <vscode-dropdown id="profiles">
                                <vscode-option>${(profileName)}</vscode-option>
                                ${profileNames.filter(name => name !== profileName).map((name) => `<vscode-option>${name}</vscode-option>`).join('')}
                            </vscode-dropdown>

                            <vscode-button id="addProfileLink">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
                                </svg>
                            </vscode-button>
                        </div>
                        <vscode-divider></vscode-divider>
                        ${this.state.isLoading ? `<vscode-progress-ring id="loading-ring"></vscode-progress-ring>` : "<div style=''>Configuration</div>"}
                        <div class="setup-container ${this.state.isLoading ? "invisible" :""}">
                            <svg width="20" height="20" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><g><path d="M7.99967 1.33313L1.33301 4.66646L7.99967 7.9998L14.6663 4.66646L7.99967 1.33313Z" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"></path><path d="M1.33301 11.3331L7.99967 14.6665L14.6663 11.3331" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"></path><path d="M1.33301 7.99988L7.99967 11.3332L14.6663 7.99988" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"></path></g></svg>
                            <vscode-dropdown id="clusters">
                            <vscode-option>${cluster?.name}</vscode-option>
                                ${(this.context.getClusters() || []).filter(x => x.name !== cluster?.name).map(({name}) => `<vscode-option>${name}</vscode-option>`).join('')}
                            </vscode-dropdown>
                        </div>
                        <div class="setup-container ${this.state.isLoading ? "invisible" :""}">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
                            </svg>
                            <vscode-dropdown id="databases">
                                <vscode-option>${database && database.name}</vscode-option>
                                ${(this.context.getDatabases() || []).filter(x => x.name !== database?.name).map(({name}) => `<vscode-option>${name}</vscode-option>`).join('')}
                            </vscode-dropdown>
                        </div>
                        <div class="setup-container ${this.state.isLoading ? "invisible" :""}">
                            <svg width="20" height="20" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.2" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M6 6.878V6a2.25 2.25 0 012.25-2.25h7.5A2.25 2.25 0 0118 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 004.5 9v.878m13.5-3A2.25 2.25 0 0119.5 9v.878m0 0a2.246 2.246 0 00-.75-.128H5.25c-.263 0-.515.045-.75.128m15 0A2.25 2.25 0 0121 12v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6c0-.98.626-1.813 1.5-2.122" />
                            </svg>
                            <vscode-dropdown id="schemas">
                                <vscode-option>${schema && schema.name}</vscode-option>
                                ${(this.context.getSchemas() || []).filter(x => x.name !== schema?.name).map(({name}) => `<vscode-option>${name}</vscode-option>`).join('')}
                            </vscode-dropdown>
                        </div>
                    </div>
                `);
            }
        };

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">

            <!--
                Use a content security policy to only allow loading styles from our extension directory,
                and only allow scripts that have a specific nonce.
                (See the 'webview-sample' extension sample for img-src content secsurity policy examples)
            -->
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="${styleUri}" rel="stylesheet">

            <title>Materialize Profile</title>
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
