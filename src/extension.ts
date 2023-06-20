import * as vscode from 'vscode';
import DatabaseTreeProvider from "./databaseTreeProvider";
import { SidebarProvider } from './authProvider';
// import { RunEditorProvider } from './runEditorProvider';
// import FileTreeProvider from './fileExplorer';

export function activate(context: vscode.ExtensionContext) {
	const rootPath = (vscode.workspace.workspaceFolders && (vscode.workspace.workspaceFolders.length > 0))
	? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined;

    const databaseTreeProvider = new DatabaseTreeProvider();
    vscode.window.createTreeView('explorer', { treeDataProvider: databaseTreeProvider });

    // Register the Sidebar Panel
	const sidebarProvider = new SidebarProvider(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			"auth",
			sidebarProvider
		)
	);

    // Register a command with the provided command identifier
    let disposable = vscode.commands.registerCommand('materialize.run', () => {
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
    context.subscriptions.push(disposable);
}

export function deactivate() {}
