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

    console.log("ALL IS WELL");

    const logError = (error) => {
        vscode.postMessage({ type: "logError", data: { error } });
    };
    console.error = logError;

    console.log("Adding list1ener0.");
    document.getElementById("profiles")?.addEventListener('change', (e) => {
        onProfileChange(e.target && e.target.value);
    });

    document.getElementById('loginButton')?.addEventListener('click', () => {
        const profileName = document.getElementById('profileNameInput')?.value;
        onLoginClicked(profileName);
    });

    document.getElementById('addProfileLink')?.addEventListener('click', () => {
        onAddProfile();
    });

    console.log("Adding list1ener.");
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

    console.log("Adding li2stener.");
    document.getElementById('cancelAddProfile')?.addEventListener('click', () => {
        onCancelAddProfile();
    });


    console.log("Adding li2ste3ner.");
    document.getElementById('continueProfileButton')?.addEventListener('click', () => {
        const profileName = document.getElementById('profileNameInput')?.value;
        onContinueProfile(profileName);
    });

    // console.log("Adding listener.");
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
            case 'newEnvironment':
                {
                    const { data } = message;

                    console.log("Loading stuff");
                    ["clusters", "schemas", "databases"].forEach((type) => {
                        const selectNode = document.getElementById(type);

                        if (selectNode) {
                            selectNode.innerHTML = '';

                            data[type].forEach((name) => {
                                console.log("??- ", name);
                                const optionNode = document.createElement("vscode-option");
                                optionNode.innerText = name;
                                selectNode.appendChild(optionNode);
                            });

                            selectNode.value = data[type.substring(0, type.length - 1)];
                        }
                    });
                    console.log("JS", "Setting invisible");
                    document.getElementById("loading-ring")?.style.visibility = "hidden";
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
}());

