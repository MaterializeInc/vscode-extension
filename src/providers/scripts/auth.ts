/*
 * This file imports all the VSCode UX/UI guidelines.
 */

// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.
(function () {
    // @ts-ignore
    const vscode = acquireVsCodeApi();

    // Load UX/UI from VSCode.
    const { provideVSCodeDesignSystem, vsCodeDropdown, vsCodeTextField, vsCodeOption, vsCodeButton, vsCodeDataGrid, vsCodeDataGridCell, vsCodeDataGridRow, vsCodeLink, vsCodeProgressRing, vsCodeDivider } = require ("@vscode/webview-ui-toolkit");

    provideVSCodeDesignSystem().register(vsCodeDropdown(), vsCodeOption(), vsCodeButton(), vsCodeDataGrid(), vsCodeDataGridCell(), vsCodeDataGridRow(), vsCodeLink(), vsCodeTextField(), vsCodeProgressRing(), vsCodeDivider());

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

    document.getElementById('cancelRemoveProfileButton')?.addEventListener('click', () => {
        onCancelRemoveProfile();
    });

    document.getElementById('continueRemoveProfileButton')?.addEventListener('click', () => {
        onContinueRemoveProfile();
    });

    document.getElementById('removeProfileButton')?.addEventListener('click', () => {
        onRemoveProfile();
    });

    document.getElementById('addProfileButton')?.addEventListener('click', () => {
        onAddProfile();
    });

    const porfileNameInput = document.getElementById('profileNameInput');

    if (porfileNameInput) {
        // Profile names must consist of only ASCII letters, ASCII digits, underscores, and dashes
        const pattern = /^[a-zA-Z0-9_\-]+$/;

        // Listen when the user presses Enter.
        // It is useful when creating a new profile.
        // After typing the name pressing enter will trigger the `Continue` button.
        document.addEventListener("keydown", function(event) {
            if (event.key === "Enter") {
                const profileName = (porfileNameInput as HTMLInputElement).value;

                if(profileName.length && pattern.test(profileName)) {
                    onContinueProfile(profileName);
                }
            }
        });

        porfileNameInput.addEventListener('input', (event) => {
            const inputValue = (event.target as HTMLInputElement).value;
            const continueProfileButton = document.getElementById('continueProfileButton') as HTMLButtonElement;

            if (continueProfileButton) {
                const invalidProfileNameErrorMessage = document.getElementById('invalidProfileNameErrorMessage') as HTMLParagraphElement;

                if(!inputValue.length || !pattern.test(inputValue)) {
                    // Disable continue
                    continueProfileButton.disabled = true;

                    if (!inputValue.length) {
                        invalidProfileNameErrorMessage.style.display = "none";
                    } else {
                        invalidProfileNameErrorMessage.style.display = "block";
                    }
                } else {
                    invalidProfileNameErrorMessage.style.display = "none";
                    // Enable continue
                    continueProfileButton.disabled = false;
                }
            }
        });
    }

    const removeProfileNameInput  = document.getElementById('removeProfileNameInput');

    if (removeProfileNameInput) {
        // Listen when the user presses Enter.
        // It is useful when removing a new profile.
        // After typing the name pressing enter will trigger the `Remove` button.
        document.addEventListener("keydown", function(event) {
            if (event.key === "Enter") {
                const inputValue = (event.target as HTMLInputElement).value;

                if (inputValue ===  removeProfileNameInput.getAttribute("confirm-data")) {
                    onContinueRemoveProfile();
                }
            }
        });

        removeProfileNameInput.addEventListener('input', (event) => {
            const inputValue = (event.target as HTMLInputElement).value;
            const continueRemoveProfileButton = document.getElementById('continueRemoveProfileButton') as HTMLButtonElement;

            if (inputValue ===  removeProfileNameInput.getAttribute("confirm-data")) {
                if (continueRemoveProfileButton) {
                    continueRemoveProfileButton.disabled = false;
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
                // Disable profile interactions of any kind.
                const addProfileButton = document.getElementById("addProfileButton") as HTMLSelectElement;
                addProfileButton.disabled = true;

                const removeProfileButton = document.getElementById("removeProfileButton") as HTMLSelectElement;
                removeProfileButton.disabled = true;

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
    function onCancelRemoveProfile() {
        vscode.postMessage({ type: 'onCancelRemoveProfile' });
    }
    function onContinueRemoveProfile() {
        vscode.postMessage({ type: 'onContinueRemoveProfile' });
    }
    function onRemoveProfile() {
        vscode.postMessage({ type: 'onRemoveProfile' });
    }
}());

