import * as vscode from "vscode";
import * as toml from "toml";
import * as os from "os";
import { readFileSync } from "fs";
import { Request, Response, Application } from 'express';

const homeDir = os.homedir();
const configDir = `${homeDir}/.config/materialize`;
const configName = "mz.toml";
const configPath = `${configDir}/${configName}`;

export interface Profile {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "app-password": String,
    region: String,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "admin-endpoint": String,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "cloud-endpoint": String,
}

interface Config {
    profile: String;
    profiles: { [name: string] : Profile; }
}

export class SidebarProvider implements vscode.WebviewViewProvider {
    _view?: vscode.WebviewView;
    _doc?: vscode.TextDocument;
    config?: Config;

    constructor(private readonly _extensionUri: vscode.Uri) {
        try {
            let configInToml = readFileSync(configPath, 'utf-8');
            this.config = toml.parse(configInToml);
        } catch (err) {
            console.error(err);
        }
    }

    public resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;

        webviewView.webview.options = {
            // Allow scripts in the webview
            enableScripts: true,

            localResourceRoots: [this._extensionUri],
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Listen for messages from the Sidebar component and execute action
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case "onLogin": {
                    const express = require('express');
                    const app: Application = express();

                    await new Promise((resolve, reject) => {
                        app.get('/', (req: Request, res: Response) => {
                            const {secret, clientId, email, description } = req.query;
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
        // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));


		// Do the same for the stylesheet.
		const styleResetUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'reset.css'));
		const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css'));
		const styleCustomUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'custom.css'));

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

            <link href="${styleResetUri}" rel="stylesheet">
            <link href="${styleVSCodeUri}" rel="stylesheet">
            <link href="${styleCustomUri}" rel="stylesheet">

            <title>Materialize Auth</title>
        </head>
        <body>
            <div id="profiles_container">
                <label for="profiles">Profile</label>
                <select id="profiles">
                    ${this.config && Object.keys(this.config.profiles).map((name) => `<option>${name}</option>`)}
                </select>
            </div>
            <button id="loginButton">Login</button>

            <script nonce="${nonce}" src="${scriptUri}"></script>
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
