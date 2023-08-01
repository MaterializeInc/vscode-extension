// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.
(function () {
    // @ts-ignore
    const vscode = acquireVsCodeApi();

    const oldState = vscode.getState() || { profiles: [] };

    /** @type {Array<{ value: string }>} */
    let profiles = oldState.profiles;

    const logInfo = (...messages: Array<string>) => {
        vscode.postMessage({ type: "logInfo", data: { messages } });
    };
    console.log = logInfo;

    const logError = (error: string) => {
        vscode.postMessage({ type: "logError", data: { error } });
    };
    console.error = logError;

    document.getElementById("profiles")?.addEventListener('change', (e) => {
        onProfileChange((e.target as HTMLSelectElement).value);
    });

    document.getElementById("schemas")?.addEventListener('change', (e) => {
        onConfigChange((e.target as HTMLSelectElement).value, "schemas");
    });

    document.getElementById("clusters")?.addEventListener('change', (e) => {
        onConfigChange((e.target as HTMLSelectElement).value, "clusters");
    });

    document.getElementById("databases")?.addEventListener('change', (e) => {
        onConfigChange((e.target as HTMLSelectElement).value, "databases");
    });

    document.getElementById('loginButton')?.addEventListener('click', () => {
        const profileName = (document.getElementById('profileNameInput')as HTMLInputElement).value;
        onLoginClicked(profileName);
    });

    document.getElementById('addProfileLink')?.addEventListener('click', () => {
        onAddProfile();
    });

    const porfileNameInput = document.getElementById('profileNameInput');

    if (porfileNameInput) {
        porfileNameInput.addEventListener('input', (event) => {
            const inputValue = (event.target as HTMLInputElement).value;
            const continueProfileButton = document.getElementById('continueProfileButton') as HTMLButtonElement;

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
        const profileName = (document.getElementById('profileNameInput') as HTMLInputElement).value;
        onContinueProfile(profileName);
    });

    // Handle messages sent from the extension to the webview
    window.addEventListener('message', event => {
        const message = event.data; // The json data that the extension sent
        switch (message.type) {
            case 'newProfile':
                {
                    const { profiles, profile } = message.data;
                    const profilesSelectElement = document.getElementById("profiles") as HTMLSelectElement;

                    if (profilesSelectElement) {
                        profilesSelectElement.innerHTML = '';

                        profiles.forEach((name: string) => {
                            const optionNode = document.createElement("vscode-option");
                            optionNode.innerText = name;
                            profilesSelectElement.appendChild(optionNode);
                        });

                        profilesSelectElement.value = profile;
                    }
                    break;
                }
            case "environmentChange": {
                const profiles = document.getElementById("profiles") as HTMLSelectElement;
                profiles.disabled = true;

                const clusters = document.getElementById("clusters") as HTMLSelectElement;
                clusters.disabled = true;

                const databases = document.getElementById("databases") as HTMLSelectElement;
                databases.disabled = true;

                const schemas = document.getElementById("schemas") as HTMLSelectElement;
                schemas.disabled = true;
            }
        }
    });

    function onProfileChange(name: string) {
        vscode.postMessage({ type: "onProfileChange", data: { name } });
    }
    function onCancelAddProfile() {
        vscode.postMessage({ type: "onCancelAddProfile" });
    }
    function onLoginClicked(name: string) {
        vscode.postMessage({ type: 'onLogin', data: { name } });
    }
    function onAddProfile() {
        vscode.postMessage({ type: 'onAddProfile' });
    }
    function onContinueProfile(name: string) {
        vscode.postMessage({ type: 'onContinueProfile', data: { name } });
    }
    function onConfigChange(name: string, type: string) {
        vscode.postMessage({ type: 'onConfigChange', data: { name, type } });
    }
}());

