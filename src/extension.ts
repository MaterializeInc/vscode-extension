import * as vscode from 'vscode';
import { buildRunSQLCommand } from './providers/query';
import AsyncContext from './context/asyncContext';
import * as Sentry from "@sentry/node";

if (process.env.NODE_ENV !== "development") {
    // Sentry.init({
    //     dsn: "https://993291e6240141585c42efb7d0c958e2@o561021.ingest.sentry.io/4506269930029056",
    // });

    process.on('uncaughtException', (err) => {
        // Sentry.captureException(err);

        // Allow VS Code to make the decision.
        // It will display an error notification to the user.
        throw err;
    });
}

// User context. Contains auth information, cluster, database, schema, etc.
let context: AsyncContext;

export function activate(vsContext: vscode.ExtensionContext) {
    console.log("[Extension]", "Activating Materialize extension.");
    context = new AsyncContext(vsContext);

    // Register the `Run SQL` command.
    const runDisposable = vscode.commands.registerCommand('materialize.run', async () => {
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
        sqlCommand()
    });

    const copyDisposable = vscode.commands.registerCommand('materialize.copy', async ({ tooltip }) => {
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

    const copySQLDisposable = vscode.commands.registerCommand('extension.copySQL', (sql: string) => {
        vscode.env.clipboard.writeText(sql);
    });

    vsContext.subscriptions.push(copySQLDisposable);

    return context;
}

export function deactivate() {
    console.log("[Extension]", "Deactivating Materialize extension.");
    Sentry.close(2000).then(() => {
        context.stop();
    });
}
