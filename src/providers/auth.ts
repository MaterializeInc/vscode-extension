import * as vscode from "vscode";
import { Request, Response, Application } from 'express';
import { Context, EventType } from "../context";
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
    context: AsyncContext;
    state: State;

    constructor(private readonly _extensionUri: vscode.Uri, context: AsyncContext) {
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
        this.context.isReady().then(() => {
            this.state = {
                ...this.state,
                isLoading: false,
                error: undefined,
            };
        });
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
        this.state.error = this.capitalizeFirstLetter(message);
        this.state.isLoading = false;

        if (this._view) {
            this._view.webview.html = this._getHtmlForWebview(this._view.webview);
        }
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
            this.state.isLoading = false;

            // Do not refresh the webview if the user is removing or adding a profile.
            // The UI will auto update after this action ends.
            if (this.state.isRemoveProfile || this.state.isAddNewProfile) {
                return;
            }
            console.log("[AuthProvider]", "Triggering configuration webview.");
            this._view.webview.html = this._getHtmlForWebview(this._view.webview);
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
            await this.context.addAndSaveProfile(name, appPassword, region.toString());
        } else {
            // Cancel login process.
            webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        }
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
            console.log("[AuthProvider]", "Receive message: ", type);
            switch (type) {
                case "onLogin": {
                    const { name } = data;

                    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
                    loginServer(name).then((appPasswordResponse) => {
                        this.checkLoginServerResponse(appPasswordResponse, name, webviewView).then(() => {
                            webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
                        });
                    }).catch((err) => {
                        console.error("Error setting up the server: ", err);
                        vscode.window.showErrorMessage('Internal error while waiting for the credentials.');
                        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

                    });
                    break;
                }
                case "onContinueProfile": {
                    const { name } = data;
                    loginServer(name).then((appPasswordResponse) => {
                        this.checkLoginServerResponse(appPasswordResponse, name, webviewView);
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
                // Remove Profile:
                case "onCancelRemoveProfile": {
                    this.state.isRemoveProfile = false;
                    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
                    break;
                }
                case "onContinueRemoveProfile": {
                    this.state.isRemoveProfile = false;

                    // Set the state loading to true. After the new context is loaded
                    // loading will turn false.
                    this.state.isLoading = true;
                    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

                    const name = this.context.getProfileName();

                    if (name) {
                        await this.context.removeAndSaveProfile(name);
                    } else {
                        console.error("[Auth]", "Profile name is not available.");
                    }

                    break;
                }
                case "onRemoveProfile": {
                    this.state.isRemoveProfile = true;
                    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
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
        // const webviewUri = getUri(webview, this._extensionUri, ["out", "webview", "index.js"]);
        const scriptUri = getUri(webview, this._extensionUri, ["out", "providers", "scripts", "auth.js"]);
        const styleUri = getUri(webview, this._extensionUri, ["resources", "style.css"]);

        const config = vscode.workspace.getConfiguration('workbench');
        const currentTheme = config.get<string>('colorTheme');
        const logoUri = getUri(webview, this._extensionUri, ["resources", currentTheme?.includes('Dark') ? "logo.png" : "logo_color.png"]);

		// Use a nonce to only allow a specific script to be run.
		const nonce = getNonce();

        console.log("[AuthProvider]", "Is loading: ", this.state.isLoading);
        let content = (
            `
            <vscode-text-field id="profileNameInput" ${this.state.isLoading ? "disabled": ""}>Profile Name</vscode-text-field>
            <p id="invalidProfileNameErrorMessage">Profile name must contain only ASCII letters, ASCII digits, underscores, and dashes.</p>
            <div class="setup-container-actions">
                <vscode-button appearence="primary" id="continueProfileButton" class="action_button" disabled=true>Continue</vscode-button>
            </div>
            `
        );
        const profileNames = this.context.getProfileNames();

        console.log("[AuthProvider]", "State:", this.state, profileNames);
        if (profileNames) {
            if (this.state.isAddNewProfile) {
                content = (
                    `<vscode-text-field id="profileNameInput">Profile Name</vscode-text-field>
                    <p id="invalidProfileNameErrorMessage">Profile name must contain only ASCII letters, ASCII digits, underscores, and dashes.</p>
                    <div class="setup-container-actions">
                        <vscode-button class="action_button" appearance="secondary" id="cancelAddProfile">Cancel</vscode-button>
                        <vscode-button class="action_button" id="continueProfileButton"
                        disabled=true>Continue</vscode-button>
                    </div>`
                );
            } else if (this.state.isRemoveProfile) {
                content = (
                    `<div>
                        <p>You are about to remove a profile from your configuration.</p>
                        <p>Please type <b>${this.context.getProfileName()}</b> to confirm: </p>
                        <vscode-text-field id="removeProfileNameInput" confirm-data="${this.context.getProfileName()}"></vscode-text-field>
                        <div class="setup-container-actions">
                            <vscode-button class='action_button' appearance="secondary" id="cancelRemoveProfileButton">Cancel</vscode-button>
                            <vscode-button class='action_button' appearance="primary" id="continueRemoveProfileButton" disabled=true>Remove</vscode-button>
                        </div>
                    </div>`
                );
            } else {
                const database = this.context.getDatabase();
                const schema = this.context.getSchema();
                const cluster = this.context.getCluster();
                const profileName = this.context.getProfileName();
                console.log("[AuthProvider]", "State error?: ", this.state.error);

                content = (
                    `<div class="profile-container">
                        <!--  The following container is an extract from the guidelines: -->
                        <!--  https://github.com/microsoft/vscode-webview-ui-toolkit/tree/main/src/dropdown#with-label -->
                        <div class="dropdown-container">
                            <label for="profiles">Profile</label>
                            <vscode-dropdown id="profiles" ${this.state.isLoading ? "disabled=true" :""}>
                                <vscode-option>${(profileName)}</vscode-option>
                                ${profileNames.filter(name => name !== profileName).map((name) => `<vscode-option>${name}</vscode-option>`).join('')}
                            </vscode-dropdown>
                        </div>
                        <div class="setup-container-actions">
                            <vscode-button class='action_button' appearance="secondary" id="removeProfileButton" aria-label="Remove Profile">
                                Remove
                            </vscode-button>
                            <vscode-button class='action_button' id="addProfileButton" appearance="primary" aria-label="Add Profile">
                                Add
                            </vscode-button>
                        </div>
                        <vscode-divider></vscode-divider>
                        ${this.state.error ? `<p class="profileErrorMessage">${this.state.error}</p>`: ""}
                        ${this.state.isLoading ? `<vscode-progress-ring id="loading-ring"></vscode-progress-ring>` : ""}
                        ${(!this.state.isLoading && !this.state.error) ? "<span id='options-title'>Connection Options</span>": ""}
                        ${(!this.state.isLoading && !this.state.error) ? `
                            <div class="setup-container ${this.state.isLoading ? "invisible" :""}">
                                <div class="dropdown-container">
                                    <label for="clusters">Cluster</label>
                                    <vscode-dropdown id="clusters">
                                        <vscode-option>${cluster}</vscode-option>
                                        ${(this.context.getClusters() || []).filter(x => x.name !== cluster).map(({name}) => `<vscode-option>${name}</vscode-option>`).join('')}
                                    </vscode-dropdown>
                                </div>
                            </div>
                            <div class="setup-container ${this.state.isLoading ? "invisible" :""}">
                                <div class="dropdown-container">
                                    <label for="databases">Database</label>
                                    <vscode-dropdown id="databases">
                                        <vscode-option>${database}</vscode-option>
                                        ${(this.context.getDatabases() || []).filter(x => x.name !== database).map(({name}) => `<vscode-option>${name}</vscode-option>`).join('')}
                                    </vscode-dropdown>
                                </div>
                            </div>
                            <div class="setup-container ${this.state.isLoading ? "invisible" :""}">
                                <div class="dropdown-container">
                                    <label for="schemas">Schema</label>
                                        <vscode-dropdown id="schemas">
                                            <vscode-option>${schema}</vscode-option>
                                            ${(this.context.getSchemas() || []).filter(x => x.name !== schema).map(({name}) => `<vscode-option>${name}</vscode-option>`).join('')}
                                        </vscode-dropdown>
                                </div>
                            </div>
                        `: ""}
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
                <div id="logoContainer">
                    <img id="logo" src="${logoUri}" alt="Materialize Logo" />
                </div>
                ${content}
            </div>

            <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
        </body>
        </html>`;
    }
}
