import * as vscode from "vscode";
import { getNonce, getUri } from "../utilities/utils";
import AppPassword from "../context/appPassword";
import AsyncContext from "../context/asyncContext";
import { Errors, ExtensionError } from "../utilities/error";
import AdminClient from "../clients/admin";
import CloudClient from "../clients/cloud";
import { oauthLogin } from "../clients/oauth";

/**
 * Picks the region for a new profile: the only region with an enabled
 * environment if there is exactly one, otherwise the user's choice.
 * @returns the region ID, e.g. `aws/us-east-1`, or nothing if the user cancels.
 */
async function selectRegion(appPassword: AppPassword): Promise<string | undefined> {
    const cloudClient = new CloudClient(new AdminClient(appPassword.toString()));
    const providers = await cloudClient.listCloudProviders();

    const enabled: string[] = [];
    for (const provider of providers) {
        try {
            const { regionInfo } = await cloudClient.getRegion(provider);
            if (regionInfo) {
                enabled.push(provider.id);
            }
        } catch (err) {
            console.error("[AuthProvider]", "Error retrieving region: ", provider.id, err);
        }
    }

    const candidates = enabled.length > 0 ? enabled : providers.map((provider) => provider.id);
    if (candidates.length === 1) {
        return candidates[0];
    }
    return vscode.window.showQuickPick(candidates, { placeHolder: "Select the region for this profile" });
}

/**
 * Signs in through the browser and selects the profile's region.
 * @returns the profile's app password and region, or nothing if the user cancels.
 */
async function browserLogin(name: string): Promise<{ appPassword: AppPassword, region: string } | undefined> {
    try {
        const appPassword = await oauthLogin(name, (url) => vscode.env.openExternal(vscode.Uri.parse(url)));
        if (!appPassword) {
            return undefined;
        }
        const region = await selectRegion(appPassword);
        return region ? { appPassword, region: region.toLowerCase() } : undefined;
    } catch (err) {
        throw new ExtensionError(Errors.browserAuthFailure, err);
    }
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
            theme: this.getTheme(),
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
        appPasswordResponse: { appPassword: AppPassword, region: string } | undefined,
        name: string
    ) {
        if (appPasswordResponse) {
            const { appPassword, region } = appPasswordResponse;
            await this.context.addAndSaveProfile(name, appPassword, region.toString());
        } else {
            // Cancel login process.
        }
    }

    private getTheme() {
        const config = vscode.workspace.getConfiguration('workbench');
        const currentTheme = config.get<string>('colorTheme');
        return currentTheme;
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
                            console.error("[Auth]", "Error publishing the context: ", err);
                        }
                    }
                    break;
                }
                case "onAddProfile": {
                    const { name } = data;

                    browserLogin(name).then((appPasswordResponse) => {
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
}
