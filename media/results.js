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

    // Handle messages sent from the extension to the webview
    window.addEventListener('message', ({ data }) => {
        const { type } = data;
        console.log("[Results.js]", "New message - Type: ", type);

        switch (type) {
            case 'results':
                {
                    const { data: results } = data;
                    const { fields, rows } = results;
                    const container = document.getElementById("container");
                    container.innerHTML = "";

                    // Create the main table element
                    const table = document.createElement("vscode-data-grid");
                    table.setAttribute("aria-label", "Basic");

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

                    // Create data rows
                    // Loop through the data and create rows and cells
                    rows.forEach((row, i) => {
                        const dataRow = document.createElement("vscode-data-grid-row");

                        fields.forEach(({ name: field }, index) => {
                            const dataCell = document.createElement("vscode-data-grid-cell");
                            dataCell.setAttribute("grid-column", String(index + 1));
                            dataCell.innerText = row[field];

                            dataRow.appendChild(dataCell);
                        });

                        table.appendChild(dataRow);
                    });

                    // Append the table to the document body or a container element
                    container.appendChild(table);
                    break;
                }
            default:
                {
                    console.log("Default");
                }

        }
    });
}());

