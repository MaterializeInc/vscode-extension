import * as vscode from 'vscode';
import { AuthProvider, ResultsProvider, DatabaseTreeProvider, ActivityLogTreeProvider } from './providers';
import { Context, EventType } from './context';
import { randomUUID } from 'crypto';

// User context. Contains auth information, cluster, database, schema, etc.
let context: Context;

export function activate(vsContext: vscode.ExtensionContext) {
    console.log("[Extension]", "Activating Materialize extension.");
    context = new Context();

    // Register the activity log
    const activityLogProvider = new ActivityLogTreeProvider(vsContext);
    vscode.window.registerTreeDataProvider('activityLog', activityLogProvider);

    // Register the database explorer
	const databaseTreeProvider = new DatabaseTreeProvider(context);
    vscode.window.createTreeView('explorer', { treeDataProvider: databaseTreeProvider });

    vsContext.subscriptions.push(vscode.commands.registerCommand('materialize.refresh', () => {
        databaseTreeProvider.refresh();
    }));

    // Register the Auth Provider
	const authProvider = new AuthProvider(vsContext.extensionUri, context);
	vsContext.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			"profile",
			authProvider
		)
	);

    const resultsProvider = new ResultsProvider(vsContext.extensionUri, context);
	vsContext.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			"queryResults",
			resultsProvider,
            { webviewOptions: { retainContextWhenHidden: true } }
		)
	);

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
        vscode.commands.executeCommand('queryResults.focus').then(async () => {
            const document = activeEditor.document;
            const selection = activeEditor.selection;
            const textSelected = activeEditor.document.getText(selection).trim();
            const query = textSelected ? textSelected : document.getText();

            console.log("[RunSQLCommand]", "Running query: ", query);

            // Identify the query to not overlap results.
            // When a user press many times the run query button
            // the results from one query can overlap the results
            // from another. We only want to display the last results.
            const id = randomUUID();
            context.emit("event", { type: EventType.newQuery, data: { id } });

            // Benchmark
            const startTime = Date.now();
            try {
                const results = await context.query(query);
                const endTime = Date.now();
                const elapsedTime = endTime - startTime;

                console.log("[RunSQLCommand]", "Results: ", results);
                console.log("[RunSQLCommand]", "Emitting results.");

                if (Array.isArray(results)) {
                    context.emit("event", { type: EventType.queryResults, data: { ...results[0], elapsedTime, id } });
                } else {
                    context.emit("event", { type: EventType.queryResults, data: { ...results, elapsedTime, id } });
                }
                activityLogProvider.addLog({
                    status: "success",
                    latency: elapsedTime, // assuming elapsedTime holds the time taken for the query to execute
                    sql: query
                });
            } catch (error: any) {
                console.log("[RunSQLCommand]", error.toString());
                console.log("[RunSQLCommand]", JSON.stringify(error));
                const endTime = Date.now();
                const elapsedTime = endTime - startTime;

                activityLogProvider.addLog({
                    status: "failure",
                    latency: elapsedTime, // assuming elapsedTime holds the time taken before the error was caught
                    sql: query
                });

                context.emit("event", { type: EventType.queryResults, data: { id, rows: [], fields: [], error: {
                    message: error.toString(),
                    position: error.position,
                    query,
                }, elapsedTime }});
            } finally {
                resultsProvider._view?.show();
            }
        });
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
