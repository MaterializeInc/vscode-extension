import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import * as React from "react";

interface Props {
    primaryText: string;
    secondaryText: string;
    onPrimaryClick?: () => void;
    onSecondaryClick?: () => void;
    disable?: boolean;
    hide?: boolean;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
const Actions = ({ primaryText, secondaryText, disable, hide, onSecondaryClick, onPrimaryClick }: Props) => {
    return (
        <>
            <div className="setup-container-actions">
                {!hide &&
                    <VSCodeButton onClick={onSecondaryClick} className="action_button" appearance="secondary" id="cancelAddProfile">
                        {secondaryText}
                    </VSCodeButton>
                }
                <VSCodeButton disabled={disable} onClick={onPrimaryClick} appearance="primary" id="continueProfileButton" className="action_button">
                    {primaryText}
                </VSCodeButton>
            </div>
        </>
    );
};

export default Actions;