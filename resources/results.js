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

    const capitalizeFirstLetter = (str) => {
        if (str.length === 0) {
          return str;
        }

        const firstChar = str.charAt(0);
        const capitalized = firstChar.toUpperCase() + str.slice(1);

        return capitalized;
    };

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
                const progressRing = document.getElementById("progress-ring");
                if (progressRing) {
                    progressRing.style.display = "none";
                }

                const { data: results } = message;
                console.log("[Results.js]", "New message - Results: ", results);

                const { fields, rows, error, elapsedTime } = results;
                const tableId = "table";
                let table = document.getElementById(tableId);

                if (error) {
                    const errorContainer = document.createElement("div");
                    errorContainer.id = "errorContainer";
                    errorContainer.style.display = "flex";
                    errorContainer.style.flexFlow = "row";

                    // Error Icon
                    const errorIconContainer = document.createElement("div");
                    errorIconContainer.style.padding = "0.75rem";

                    errorIconContainer.innerHTML = `
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path fill-rule="evenodd" clip-rule="evenodd" d="M8.60012 0.999985C10.2001 1.09999 11.7001 1.89999 12.8001 2.99999C14.1001 4.39999 14.8001 6.09999 14.8001 8.09999C14.8001 9.69999 14.2001 11.2 13.2001 12.5C12.2001 13.7 10.8001 14.6 9.20012 14.9C7.60012 15.2 6.00012 15 4.60012 14.2C3.20012 13.4 2.10012 12.2 1.50012 10.7C0.900119 9.19999 0.80012 7.49999 1.30012 5.99999C1.80012 4.39999 2.70012 3.09999 4.10012 2.19999C5.40012 1.29999 7.00012 0.899985 8.60012 0.999985ZM9.10012 13.9C10.4001 13.6 11.6001 12.9 12.5001 11.8C13.3001 10.7 13.8001 9.39999 13.7001 7.99999C13.7001 6.39999 13.1001 4.79999 12.0001 3.69999C11.0001 2.69999 9.80012 2.09999 8.40012 1.99999C7.10012 1.89999 5.70012 2.19999 4.60012 2.99999C3.50012 3.79999 2.70012 4.89999 2.30012 6.29999C1.90012 7.59999 1.90012 8.99999 2.50012 10.3C3.10012 11.6 4.00012 12.6 5.20012 13.3C6.40012 14 7.80012 14.2 9.10012 13.9ZM7.90011 7.5L10.3001 5L11.0001 5.7L8.60011 8.2L11.0001 10.7L10.3001 11.4L7.90011 8.9L5.50011 11.4L4.80011 10.7L7.20011 8.2L4.80011 5.7L5.50011 5L7.90011 7.5Z" fill="#A1260D"/>
                        </svg>
                    `;

                    // Message
                    const errorMessageContainer = document.createElement("div");
                    const { position, query, message } = error;

                    const errorMessage = `${capitalizeFirstLetter(message)}`;

                    const errorElement = document.createElement("p");
                    errorElement.innerHTML = errorMessage;
                    errorMessageContainer.appendChild(errorElement);

                    // Handle the correct caret position and error message.
                    if (position || typeof position === "number") {
                        // Identify the line number
                        let lines = query.substring(0, position).split("\n");
                        let lineNumber = lines.length;
                        const linePositionMessage = lineNumber ? `LINE ${lineNumber}: <code>...${lines[lineNumber - 1]}</code>` : "";

                        const linePositionElement = document.createElement("p");
                        linePositionElement.innerHTML = linePositionMessage;
                        errorMessageContainer.appendChild(linePositionElement);

                        const caretIndicatorContainer = document.createElement('div');
                        caretIndicatorContainer.style.display = "flex";

                        // Trick to always match the parent width.
                        // Probably there are better ways but this one works.
                        const hiddenClone = document.createElement("p");
                        hiddenClone.innerHTML = linePositionMessage;
                        hiddenClone.style.visibility = "hidden";
                        caretIndicatorContainer.appendChild(hiddenClone);

                        const caretIndicator = document.createElement('div');
                        caretIndicator.style.whiteSpace = "pre";
                        caretIndicator.textContent = '^';
                        caretIndicator.style.position = "relative";
                        caretIndicator.style.left = "-15px";

                        caretIndicatorContainer.appendChild(caretIndicator);
                        errorMessageContainer.appendChild(caretIndicatorContainer);
                    }

                    // Append icon and message to the container.
                    errorContainer.appendChild(errorIconContainer);
                    errorContainer.appendChild(errorMessageContainer);
                    container.appendChild(errorContainer);
                } else if (!table) {
                    console.log("[Results.js]", "New table.");
                    // Create the main table element
                    table = document.createElement("vscode-data-grid");
                    table.setAttribute("aria-label", "Basic");
                    table.id = tableId;

                    // Create the header row
                    const headerRow = document.createElement("vscode-data-grid-row");
                    headerRow.setAttribute("row-type", "header");
                    headerRow.style.backgroundColor = "#232323";

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

