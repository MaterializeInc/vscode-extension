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
        const contentText = textSelected ? textSelected : document.getText();

        if (!context.sqlClient) {
            vscode.window.showInformationMessage('The SQL Client is not setup yet.');
        } else {
            console.log("[RunSQLCommand]", "Running query: ", contentText);
            context.emit("event", { type: EventType.newQuery });

            try {
                const results = await context.sqlClient?.query(contentText);
                console.log("[RunSQLCommand]", "Results: ", results);

                console.log("[RunSQLCommand]", "Emitting results.");
                context.emit("event", { type: EventType.queryResults, data: results });
            } catch (err) {
                context.emit("event", { type: EventType.queryResults, data: { rows: [], fields: []} });
                throw err;
            }
            // for await (const results of context.sqlClient?.cursorQuery(contentText)) {
            //     console.log("[RunSQLCommand]", "Results: ", results);

            //     console.log("[RunSQLCommand]", "Emitting results.");
            //     context.emit("event", { type: EventType.queryResults, data: results });
            // }
        }
    });

    const resultsProvider = new ResultsProvider(vsContext.extensionUri, context);
	vsContext.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			"queryResults",
			resultsProvider,
            { webviewOptions: { retainContextWhenHidden: true } }
		)
	);

    vsContext.subscriptions.push(disposable);
}

export function deactivate() {}
