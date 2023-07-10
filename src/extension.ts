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
        vscode.window.showInformationMessage('Running SQL query.');

        console.log("[RunSQLCommand]", "Firing detected.");
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            vscode.window.showErrorMessage('No active editor.');
            return;
        }

        const document = activeEditor.document;
        const fileContent = document.getText();
        const contentText = fileContent.toString();

        if (!context.sqlClient) {
            vscode.window.showInformationMessage('The SQL Client is not setup yet. Check that you are successfully login.');
        } else {
            console.log("[RunSQLCommand]", "Awaiting pool.");
            const pool = await context.sqlClient.pool;

            console.log("[RunSQLCommand]", "Running query: ", contentText);
            const results = await pool.query(contentText);
            console.log("[RunSQLCommand]", "Results: ", results);

            console.log("[RunSQLCommand]", "Emitting results.");
            context.emit("event", { type: EventType.queryResults, data: results });
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
