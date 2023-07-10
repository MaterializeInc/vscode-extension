// @ts-nocheck

// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.
(function () {
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
        onProfileChange(e.target && e.target.value);
    });

    document.getElementById("schemas")?.addEventListener('change', (e) => {
        onConfigChange(e.target && e.target.value, "schemas");
    });

    document.getElementById("clusters")?.addEventListener('change', (e) => {
        onConfigChange(e.target && e.target.value, "clusters");
    });

    document.getElementById("databases")?.addEventListener('change', (e) => {
        onConfigChange(e.target && e.target.value, "databases");
    });

    document.getElementById('loginButton')?.addEventListener('click', () => {
        const profileName = document.getElementById('profileNameInput')?.value;
        onLoginClicked(profileName);
    });

    document.getElementById('addProfileLink')?.addEventListener('click', () => {
        onAddProfile();
    });

    const porfileNameInput = document.getElementById('profileNameInput');

    if (porfileNameInput) {
        porfileNameInput.addEventListener('input', (event) => {
            const inputValue = event.target.value;
            const continueProfileButton = document.getElementById('continueProfileButton');

            if (continueProfileButton) {
                if(!inputValue.trim().length) {
                    // Disable continue
                    continueProfileButton.disabled = true;
                } else {
                    // Enable continue
                    continueProfileButton.disabled = false;
                }
            }
        });
    }

    document.getElementById('cancelAddProfile')?.addEventListener('click', () => {
        onCancelAddProfile();
    });


    document.getElementById('continueProfileButton')?.addEventListener('click', () => {
        const profileName = document.getElementById('profileNameInput')?.value;
        onContinueProfile(profileName);
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

                        selectNode.value = profile;
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
    function onLoginClicked(name) {
        vscode.postMessage({ type: 'onLogin', data: { name } });
    }
    function onAddProfile() {
        vscode.postMessage({ type: 'onAddProfile' });
    }
    function onContinueProfile(name) {
        vscode.postMessage({ type: 'onContinueProfile', data: { name } });
    }
    function onConfigChange(name, type) {
        vscode.postMessage({ type: 'onConfigChange', data: { name, type } });
    }
}());

