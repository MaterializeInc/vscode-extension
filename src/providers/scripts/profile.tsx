import { VSCodeButton, VSCodeTextField } from "@vscode/webview-ui-toolkit/react";
import * as React from "react";
import { useContext, useState } from "react";
import { Context } from "./context";
import { vscode } from ".";

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

const Profile = () => {
    const {
        profileName,
        profileNames,
        environment,
        isLoading,
    } = useContext(Context);
    const [state, setState] = useState({
        isAddNewProfile: false,
        isRemoveProfile: false,
        isLoading: false,
        error: null,
    });

    console.log("[React]", "[Index]", "State:", profileName, profileNames);
    vscode.postMessage({ type: "requestContextState" });

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
        }
    }

    return (
        <div id="container">
            <div id="logoContainer">
                <img id="logo" src={context.getLogoUri()} alt="Materialize Logo" />
            </div>
            {content}
        </div>
    );
};

export default Profile;