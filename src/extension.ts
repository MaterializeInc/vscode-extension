import * as vscode from 'vscode';
import { buildRunSQLCommand } from './providers/query';
import AsyncContext from './context/asyncContext';

// User context. Contains auth information, cluster, database, schema, etc.
let context: AsyncContext;

export function activate(vsContext: vscode.ExtensionContext) {
    console.log("[Extension]", "Activating Materialize extension.");
    context = new AsyncContext(vsContext);

    // Register the `Run SQL` command.
    let runDisposable = vscode.commands.registerCommand('materialize.run', async () => {
        console.log("[RunSQLCommand]", "Firing detected.");

        // Check for available profile before proceeding.
        if (!context.getProfileName()) {
            vscode.window.showErrorMessage('No available profile to run the query.');
            return;
        }

        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            vscode.window.showErrorMessage('No active editor.');
            return;
        }

        // Focus the query results panel.
        const sqlCommand = buildRunSQLCommand(context);
        vscode.commands.executeCommand('queryResults.focus').then(sqlCommand);
    });

    let copyDisposable = vscode.commands.registerCommand('materialize.copy', async ({ tooltip }) => {
        // Additional context information
        console.log("[CopyCommand]", "Copying tooltip: ", tooltip);
        try {
            await vscode.env.clipboard.writeText(tooltip);
        } catch (err) {
            console.log("[CopyCommand]", "Error copying value to the clipboard: ", err);
            vscode.window.showErrorMessage('Error copying value to the clipboard.');
        }
    });

    vsContext.subscriptions.push(runDisposable);
    vsContext.subscriptions.push(copyDisposable);

    let copySQLDisposable = vscode.commands.registerCommand('extension.copySQL', (sql: string) => {
        vscode.env.clipboard.writeText(sql);
    });

    vsContext.subscriptions.push(copySQLDisposable);

    return context;
}

export function deactivate() {
    console.log("[Extension]", "Deactivating Materialize extension.");
    context.stop();
}
