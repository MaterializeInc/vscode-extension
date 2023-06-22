//@ts-check

// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.
(function () {
    // @ts-ignore
    const vscode = acquireVsCodeApi();

    const oldState = vscode.getState() || { profiles: [] };

    /** @type {Array<{ value: string }>} */
    let profiles = oldState.profiles;

    document.getElementById("profiles")?.addEventListener('change', (e) => {
        // @ts-ignore
        onProfileChange(e.target && e.target.value);
    });

    // @ts-ignore
    document.getElementById('loginButton').addEventListener('click', () => {
        onLoginClicked();
    });

    // Handle messages sent from the extension to the webview
    window.addEventListener('message', event => {
        const message = event.data; // The json data that the extension sent
        switch (message.type) {
            case 'newProfile':
                {
                    const { profiles, profile } = message.data;
                    const selectNode = document.getElementById("profiles");

                    if (selectNode) {
                        selectNode.innerHTML = '';

                        profiles.forEach((name) => {
                            const optionNode = document.createElement("vscode-option");
                            optionNode.innerText = name;
                            selectNode.appendChild(optionNode);
                        });

                        // @ts-ignore
                        selectNode.value = profile;
                    }
                    break;
                }
        }
    });

    function onProfileChange(name) {
        vscode.postMessage({ type: "onProfileChange", data: { name } });
    }
    function onLoginClicked() {
        vscode.postMessage({ type: 'onLogin' });
    }
}());

