import * as vscode from 'vscode';
import { AuthProvider, ResultsProvider, DatabaseTreeProvider } from './providers';
import { Context, EventType } from './context';

export function activate(vsContext: vscode.ExtensionContext) {
    console.log("[Extension]", "Activating Materialize extension.");

    // User context.
    // Contains auth information, cluster, database, schema, etc.
    const context = new Context();

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
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            vscode.window.showErrorMessage('No active editor.');
            return;
        }

        const document = activeEditor.document;
        const selection = activeEditor.selection;
        const textSelected = activeEditor.document.getText(selection).trim();
        const query = textSelected ? textSelected : document.getText();

        console.log("[RunSQLCommand]", "Running query: ", query);
        context.emit("event", { type: EventType.newQuery });

        try {
            // Benchmark
            const startTime = Date.now();
            const results = await context.query(query);
            const endTime = Date.now();

            const elapsedTime = endTime - startTime;

            console.log("[RunSQLCommand]", "Results: ", results);
            console.log("[RunSQLCommand]", "Emitting results.");

            if (Array.isArray(results)) {
                context.emit("event", { type: EventType.queryResults, data: { ...results[0], elapsedTime } });
            } else {
                context.emit("event", { type: EventType.queryResults, data: { ...results, elapsedTime } });
            }
        } catch (error: any) {
            console.log("[RunSQLCommand]", error.toString());
            console.log("[RunSQLCommand]", JSON.stringify(error));

            context.emit("event", { type: EventType.queryResults, data: { rows: [], fields: [], error: {
                message: error.toString(),
                position: error.position,
                query,
            } }});
        } finally {
            resultsProvider._view?.show();
        }
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
    return context;
}

export function deactivate() {
    console.log("[Extension]", "Deactivating Materialize extension.");
}