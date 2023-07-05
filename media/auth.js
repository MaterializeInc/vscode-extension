//@ts-check

// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.
(function () {
    // @ts-ignore
    const vscode = acquireVsCodeApi();

    const oldState = vscode.getState() || { profiles: [] };

    /** @type {Array<{ value: string }>} */
    let profiles = oldState.profiles;

    const logInfo = (...messages) => {
        vscode.postMessage({ type: "logInfo", data: { messages } });
    };
    console.log = logInfo;

    const logError = (error) => {
        vscode.postMessage({ type: "logError", data: { error } });
    };
    console.error = logError;

    document.getElementById("profiles")?.addEventListener('change', (e) => {
        // @ts-ignore
        onProfileChange(e.target && e.target.value);
    });

    // @ts-ignore
    document.getElementById('loginButton')?.addEventListener('click', () => {
        onLoginClicked();
    });

    // @ts-ignore
    document.getElementById('addProfileLink')?.addEventListener('click', () => {
        onAddProfile();
    });

    // @ts-ignore
    document.getElementById('cancelAddProfile')?.addEventListener('click', () => {
        onCancelAddProfile();
    });

    // @ts-ignore
    document.getElementById('addProfileButton')?.addEventListener('click', () => {
        // @ts-ignore
        const profileName = document.getElementById('profileNameInput')?.value;
        onAddProfileConfirmed(profileName);
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
            case 'newClusters':
                {
                    const { clusters, cluster } = message.data;
                    const selectNode = document.getElementById("clusters");

                    if (selectNode) {
                        selectNode.innerHTML = '';

                        clusters.forEach((name) => {
                            const optionNode = document.createElement("vscode-option");
                            optionNode.innerText = name;
                            selectNode.appendChild(optionNode);
                        });

                        // @ts-ignore
                        selectNode.value = cluster;
                    }
                    break;
                }
        }
    });

    function onProfileChange(name) {
        vscode.postMessage({ type: "onProfileChange", data: { name } });
    }
    function onCancelAddProfile() {
        vscode.postMessage({ type: "onCancelAddProfile" });
    }
    function onLoginClicked() {
        vscode.postMessage({ type: 'onLogin' });
    }
    function onAddProfile() {
        vscode.postMessage({ type: 'onAddProfile' });
    }
    function onAddProfileConfirmed(name) {
        vscode.postMessage({ type: 'onAddProfileConfirmed', data: { name } });
    }
}());

