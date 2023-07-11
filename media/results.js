// @ts-nocheck

// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.
(function () {
    // @ts-ignore
    const vscode = acquireVsCodeApi();

    const oldState = vscode.getState() || { results: [] };

    /** @type {Array<{ value: string }>} */
    let results = oldState.results;

    const logInfo = (...messages) => {
        vscode.postMessage({ type: "logInfo", data: { messages } });
    };
    console.log = logInfo;

    const logError = (error) => {
        vscode.postMessage({ type: "logError", data: { error } });
    };
    console.error = logError;

    console.log("[Results.js]","Adding listener");

    // Handle messages sent from the extension to the webview
    window.addEventListener('message', ({ data: message }) => {
        const { type } = message;
        const container = document.getElementById("container");

        switch (type) {
            case "newQuery": {
                console.log("[Results.js]", "New query");
                container.innerHTML = "";
                const progressRing = document.createElement("vscode-progress-ring");
                progressRing.id = "progress-ring";
                container.appendChild(progressRing);
                break;
            }

            case "results": {
                const { data: results } = message;
                console.log("[Results.js]", "New message - Results: ", results);

                const { fields, rows } = results;
                const tableId = "table";

                let table = document.getElementById(tableId);
                if (!table) {
                    console.log("[Results.js]", "New table.");

                    const progressRing = document.getElementById("progress-ring");
                    if (progressRing) {
                        progressRing.style.display = "none";
                    }

                    // Create the main table element
                    table = document.createElement("vscode-data-grid");
                    table.setAttribute("aria-label", "Basic");
                    table.id = tableId;

                    // Create the header row
                    const headerRow = document.createElement("vscode-data-grid-row");
                    headerRow.setAttribute("row-type", "header");

                    // Create and append the header cells
                    fields.forEach(({name: field}, fi) => {
                        const headerCell = document.createElement("vscode-data-grid-cell");
                        headerCell.setAttribute("cell-type", "columnheader");
                        headerCell.setAttribute("grid-column", String(fi + 1));
                        headerCell.innerText = field;

                        headerRow.appendChild(headerCell);
                    });

                    // Append the header row to the table
                    table.appendChild(headerRow);

                    // Append the table to the document body or a container element
                    container.appendChild(table);
                }

                // Create data rows
                // Loop through the data and create rows and cells
                rows.forEach((row, i) => {
                    const dataRow = document.createElement("vscode-data-grid-row");

                    fields.forEach(({ name: field }, index) => {
                        const dataCell = document.createElement("vscode-data-grid-cell");
                        dataCell.setAttribute("grid-column", String(index + 1));
                        const value = row[field];
                        dataCell.innerText = typeof value === "object" ? JSON.stringify(value) : value;

                        dataRow.appendChild(dataCell);
                    });

                    table.appendChild(dataRow);
                });
                break;
            }

            default:
                break;
        }
    });
}());

