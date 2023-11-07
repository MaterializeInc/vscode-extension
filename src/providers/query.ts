import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import AsyncContext from "../context/asyncContext";

export const buildRunSQLCommand = (context: AsyncContext) => {
    const sqlCommand = async () => {
        const {
            activity: activityProvider,
            results: resultsProvider
        } = context.getProviders();
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
            resultsProvider.setQueryId(id);

            // Benchmark
            const startTime = Date.now();
            try {
                const results = await context.query(query);
                const endTime = Date.now();
                const elapsedTime = endTime - startTime;

                console.log("[RunSQLCommand]", "Results: ", results);
                console.log("[RunSQLCommand]", "Emitting results.");

                if (Array.isArray(results)) {
                    resultsProvider.setResults(id, { ...results[0], elapsedTime, id });
                } else {
                    resultsProvider.setResults(id, { ...results, elapsedTime, id });
                }

                activityProvider.addLog({
                    status: "success",
                    latency: elapsedTime,
                    sql: query
                });
            } catch (error: any) {
                console.log("[RunSQLCommand]", error.toString());
                console.log("[RunSQLCommand]", JSON.stringify(error));
                const endTime = Date.now();
                const elapsedTime = endTime - startTime;

                activityProvider.addLog({
                    status: "failure",
                    latency: elapsedTime, // assuming elapsedTime holds the time taken before the error was caught
                    sql: query
                });


                resultsProvider.setResults(id,
                    undefined,
                    {
                        message: error.toString(),
                        position: error.position,
                        query,
                });
            } finally {
                resultsProvider._view?.show();
            }
        });
    };

    return sqlCommand;
};