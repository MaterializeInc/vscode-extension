import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import AsyncContext from "../context/asyncContext";

// vscode.commands.executeCommand('queryResults.focus').then(async () => {
//     const document = activeEditor.document;
//     const selection = activeEditor.selection;
//     const textSelected = activeEditor.document.getText(selection).trim();
//     const query = textSelected ? textSelected : document.getText();
//     const fileName = document.fileName;

//     // Identify the query to not overlap results.
//     // When a user press many times the run query button
//     // the results from one query can overlap the results
//     // from another. We only want to display the last results.
//     const id = randomUUID();

//     try {
//         // Clean the results by emitting a newQuery event.
//         context.emit("event", { type: EventType.newQuery, data: { id } });

//         try {
//             const statements = await context.parseSql(query);

//             console.log("[RunSQLCommand]", "Running statements: ", statements);

//             const lastStatement = statements[statements.length - 1];
//             for (const statement of statements) {
//                 console.log("[RunSQLCommand]", "Running statement: ", statement);

//                 // Benchmark
//                 const startTime = Date.now();
//                 try {
//                     const results = await context.privateQuery(statement.sql);
//                     const endTime = Date.now();
//                     const elapsedTime = endTime - startTime;

//                     console.log("[RunSQLCommand]", "Results: ", results);
//                     console.log("[RunSQLCommand]", "Emitting results.");

//                     // Only display the results from the last statement.
//                     if (lastStatement === statement) {
//                         if (Array.isArray(results)) {
//                             context.emit("event", { type: EventType.queryResults, data: { ...results[0], elapsedTime, id } });
//                         } else {
//                             context.emit("event", { type: EventType.queryResults, data: { ...results, elapsedTime, id } });
//                         }
//                     }
//                     activityLogProvider.addLog({
//                         status: "success",
//                         latency: elapsedTime, // assuming elapsedTime holds the time taken for the query to execute
//                         sql: statement.sql
//                     });
//                 } catch (error: any) {
//                     console.log("[RunSQLCommand]", error.toString());
//                     console.log("[RunSQLCommand]", JSON.stringify(error));
//                     const endTime = Date.now();
//                     const elapsedTime = endTime - startTime;

//                     activityLogProvider.addLog({
//                         status: "failure",
//                         latency: elapsedTime, // assuming elapsedTime holds the time taken before the error was caught
//                         sql: statement.sql
//                     });

//                     context.emit("event", { type: EventType.queryResults, data: { id, rows: [], fields: [], error: {
//                         message: error.toString(),
//                         position: error.position,
//                         query,
//                     }, elapsedTime }});
//                     break;
//                 } finally {
//                     resultsProvider._view?.show();
//                 }
//             }
//         } catch (err) {
            // context.emit("event", { type: EventType.queryResults, data: { id, rows: [], fields: [], error: {
            //     message: "Syntax errors are present. For more information, please refer to the \"Problems\" tab.",
            //     position: undefined,
            //     query,
            // }, elapsedTime: undefined }});

            // console.error("[RunSQLCommand]", "Error running statement: ", err);
//         }
//     } catch (err) {
//         context.emit("event", { type: EventType.queryResults, data: { id, rows: [], fields: [], error: {
//             message: "Error connecting to Materialize.",
//             position: undefined,
//             query,
//         }, elapsedTime: undefined }});
//     }
// });

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

            // Identify the query to not overlap results.
            // When a user press many times the run query button
            // the results from one query can overlap the results
            // from another. We only want to display the last results.
            const id = randomUUID();
            try {
                resultsProvider.setQueryId(id);
                try {
                    const statements = await context.parseSql(query);
                    console.log("[RunSQLCommand]", "Running statements: ", statements);
                    const lastStatement = statements[statements.length - 1];

                    for (const statement of statements) {
                        console.log("[RunSQLCommand]", "Running statement: ", statement);

                        // Benchmark
                        const startTime = Date.now();
                        try {
                            const results = await context.privateQuery(statement.sql);
                            const endTime = Date.now();
                            const elapsedTime = endTime - startTime;

                            console.log("[RunSQLCommand]", "Results: ", results);
                            console.log("[RunSQLCommand]", "Emitting results.");

                            // Only display the results from the last statement.
                            if (lastStatement === statement) {
                                if (Array.isArray(results)) {
                                    resultsProvider.setResults(id, { ...results[0], elapsedTime, id });
                                } else {
                                    resultsProvider.setResults(id, { ...results, elapsedTime, id });
                                }
                            }

                            activityProvider.addLog({
                                status: "success",
                                latency: elapsedTime, // assuming elapsedTime holds the time taken for the query to execute
                                sql: statement.sql
                            });
                        } catch (error: any) {
                            console.log("[RunSQLCommand]", JSON.stringify(error));
                            const endTime = Date.now();
                            const elapsedTime = endTime - startTime;

                            activityProvider.addLog({
                                status: "failure",
                                latency: elapsedTime, // assuming elapsedTime holds the time taken before the error was caught
                                sql: statement.sql
                            });

                            resultsProvider.setResults(id,
                                undefined,
                                {
                                    message: error.toString(),
                                    position: error.position,
                                    query,
                            });

                            // Break for-loop.
                            break;
                        }
                    }
                } catch (err) {
                    resultsProvider.setResults(id,
                        undefined,
                        {
                            message: "Syntax errors are present. For more information, please refer to the \"Problems\" tab.",
                            position: 0,
                            query,
                        }
                    );

                    console.error("[RunSQLCommand]", "Error running statement: ", err);
                }
            } finally {
                resultsProvider._view?.show();
            }
        });
    };

    return sqlCommand;
};