import { VSCodeButton, VSCodeTextField } from "@vscode/webview-ui-toolkit/react";
import * as React from "react";
import { useState } from "react";
import * as Server from 'react-dom/server';

// @ts-ignore
const vscode = acquireVsCodeApi();
const elm = document.querySelector("#root");

/**
 * Context util to retrieve information from the VSCode context.
 */
const context = {
  getProfileNames: (): Array<String> => {
    return [];
  },
  getProfileName: (): String | undefined => {
    return undefined;
  },
  getLogoUri: (): string => {
    return "";
  }
};

/**
 * Log utils. To send logs back to VSCode.
 */
const logInfo = (...messages: Array<string>) => {
  vscode.postMessage({ type: "logInfo", data: { messages } });
};
console.log = logInfo;

const logError = (error: string) => {
  vscode.postMessage({ type: "logError", data: { error } });
};
console.error = logError;

const AuthProvider = () => {
    const [state, setState] = useState({
        isAddNewProfile: false,
        isRemoveProfile: false,
        isLoading: false,
        error: null,
    });

    const profileNames = context.getProfileNames();
    console.log("[AuthProvider]", state, profileNames);

    let content = (
        <>
            <VSCodeTextField id="profileNameInput">Profile Name</VSCodeTextField>
            <p id="invalidProfileNameErrorMessage">
                Profile name must contain only ASCII letters, ASCII digits, underscores, and dashes.
            </p>
            <div className="setup-container-actions">
                <VSCodeButton appearance="primary" id="continueProfileButton" className="action_button" disabled>
                    Continue
                </VSCodeButton>
            </div>
        </>
    );

    if (profileNames) {
        if (state.isAddNewProfile) {
            content = (
                <>
                    <VSCodeTextField id="profileNameInput">Profile Name</VSCodeTextField>
                    <p id="invalidProfileNameErrorMessage">
                        Profile name must contain only ASCII letters, ASCII digits, underscores, and dashes.
                    </p>
                    <div className="setup-container-actions">
                        <VSCodeButton className="action_button" appearance="secondary" id="cancelAddProfile">
                            Cancel
                        </VSCodeButton>
                        <VSCodeButton className="action_button" id="continueProfileButton" disabled>
                            Continue
                        </VSCodeButton>
                    </div>
                </>
            );
        } else if (state.isRemoveProfile) {
            content = (
                <div>
                    <p>You are about to remove a profile from your configuration.</p>
                    <p>Please type <b>{context.getProfileName()}</b> to confirm: </p>
                    <VSCodeTextField id="removeProfileNameInput" confirm-data={context.getProfileName()}></VSCodeTextField>
                    <div className="setup-container-actions">
                        <VSCodeButton className='action_button' appearance="secondary" id="cancelRemoveProfileButton">
                            Cancel
                        </VSCodeButton>
                        <VSCodeButton className='action_button' appearance="primary" id="continueRemoveProfileButton" disabled>
                            Remove
                        </VSCodeButton>
                    </div>
                </div>
            );
        } else {
            // Similar logic to produce JSX content for other cases
            // Omitted for brevity...
        }
    }

    return (
        <div id="container">
            <div id="logoContainer">
                <img id="logo" src={context.getLogoUri()} alt="Materialize Logo" /> {/* Assuming `logoUri` is available in this context */}
            </div>
            {content}
            {/* ... */}
        </div>
    );
};

export default AuthProvider;

const App = (): JSX.Element => {
  const [message, setMessage] = React.useState<string>("Some message");
  vscode.postMessage({ type: "logInfo", data: { messages: ["Random"] }});

  return (
    <div>
      <VSCodeButton></VSCodeButton>
    </div>
  );
};

if (elm) {
  elm.innerHTML = Server.renderToString(<AuthProvider />);
}