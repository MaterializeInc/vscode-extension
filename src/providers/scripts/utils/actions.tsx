import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import * as React from "react";

interface Props {
    primaryText: string;
    secondaryText: string;
    onPrimaryClick?: () => void;
    onSecondaryClick?: () => void;
    disable?: boolean;
    hidden?: boolean;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
const Actions = ({ primaryText, secondaryText, disable, hidden, onSecondaryClick, onPrimaryClick }: Props) => {
    return (
        <>
            <div className="setup-container-actions">
                {!hidden &&
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