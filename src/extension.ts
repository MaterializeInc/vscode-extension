import * as vscode from 'vscode';
import DatabaseTreeProvider from "./databaseTreeProvider";
import AuthProvider from './authProvider';
import { Context } from './context';

export function activate(vsContext: vscode.ExtensionContext) {
    // User context.
    // Contains auth information, cluster, database, schema, etc.
    const context = new Context();

    // Register the database explorer
	const databaseTreeProvider = new DatabaseTreeProvider(context);
    vscode.window.createTreeView('explorer', { treeDataProvider: databaseTreeProvider });

    // Register the Auth Provider
	const sidebarProvider = new AuthProvider(vsContext.extensionUri, context);
	vsContext.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			"auth",
			sidebarProvider
		)
	);

    // Register the `Run SQL` command.
    let disposable = vscode.commands.registerCommand('materialize.run', async () => {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            vscode.window.showErrorMessage('No active editor.');
            return;
        }

        const document = activeEditor.document;
        const fileContent = document.getText();
        const contentText = fileContent.toString();

        vscode.window.showInformationMessage(contentText);

        // The code to be executed when the command is triggered
        vscode.window.showInformationMessage('Custom command executed!');
    });
    vsContext.subscriptions.push(disposable);
}

export function deactivate() {}
