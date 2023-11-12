import { VSCodeTextField } from "@vscode/webview-ui-toolkit/react";
import * as React from "react";
import { useCallback, useContext, useEffect, useState } from "react";
import Actions from "../utils/actions";
import { Context } from "../context";

interface State {
    isLoading: boolean;
    error?: boolean;
    name: string;
}

interface Props {
    onContinue: () => void;
    onCancel: () => void;
}

// Profile names must consist of only ASCII letters, ASCII digits, underscores, and dashes
const pattern = /^[a-zA-Z0-9_\-]+$/;

const RemoveProfile = ({ onCancel, onContinue }: Props) => {
    const { profileName } = useContext(Context);
    const [state, setState] = useState<State>({
        isLoading: false,
        error: undefined,
        name: "",
    });

    const isNameValid = useCallback((name: string) => {
        return name === profileName;
    }, [profileName]);

    const handleOnProfileNameChange = useCallback((e: Event | React.FormEvent<HTMLElement>) => {
        const target = e.target as HTMLInputElement;
        const { value } = target;

        setState({
            ...state,
            name: value
        });
    }, []);

    const handleOnContinue = useCallback(() => {
        const { name } = state;
        if (isNameValid(name)) {
            onContinue();
        }
    }, [state, isNameValid]);

    useEffect(() => {
        // Listen when the user presses Enter.
        // It is useful when creating a new profile.
        // After typing the name pressing enter will trigger the `Continue` button.
        const f = (event: KeyboardEvent) => {
            if (event.key === "Enter") {
                const name = (event.target as HTMLInputElement).value;

                if(isNameValid(name)) {
                    onContinue();
                }
            }
        };
        document.addEventListener("keydown", f);

        return () => {
            document.removeEventListener("keydown", f);
        };
    }, [onContinue]);

    return (
        <>
            <p>You are about to remove a profile from your configuration.<br/><br/>
            Please type <b>{profileName}</b> to confirm:
            </p>
            <VSCodeTextField id="profileNameInput" onInput={handleOnProfileNameChange}/>
            <Actions
                primaryText="Continue"
                secondaryText="Cancel"
                disable={!isNameValid(state.name)}
                onSecondaryClick={onCancel}
                onPrimaryClick={handleOnContinue}
            />
        </>
    );
};

export default RemoveProfile;