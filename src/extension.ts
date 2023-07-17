import * as vscode from 'vscode';
import { AuthProvider, ResultsProvider, DatabaseTreeProvider } from './providers';
import { Context, EventType } from './context';

export function activate(vsContext: vscode.ExtensionContext) {
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
    let disposable = vscode.commands.registerCommand('materialize.run', async () => {
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

        if (!context.sqlClient) {
            vscode.window.showInformationMessage('The SQL Client is not setup yet.');
        } else {
            console.log("[RunSQLCommand]", "Running query: ", query);
            context.emit("event", { type: EventType.newQuery });

            try {
                // Benchmark
                const startTime = Date.now();
                const results = await context.sqlClient?.query(query);
                const endTime = Date.now();

                const elapsedTime = endTime - startTime;

                console.log("[RunSQLCommand]", "Results: ", results);
                console.log("[RunSQLCommand]", "Emitting results.");
                context.emit("event", { type: EventType.queryResults, data: { ...results, elapsedTime } });
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
        }
    });

    vsContext.subscriptions.push(disposable);
}

export function deactivate() {}
