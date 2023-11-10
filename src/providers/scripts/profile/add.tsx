import { VSCodeTextField } from "@vscode/webview-ui-toolkit/react";
import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import Actions from "../utils/actions";

interface State {
    isLoading: boolean;
    error?: boolean;
    name: string;
}

interface Props {
    onContinue: (validProfileName: string) => void;
    onCancel?: () => void;
    mandatory: boolean;
}

// Profile names must consist of only ASCII letters, ASCII digits, underscores, and dashes
const pattern = /^[a-zA-Z0-9_\-]+$/;

const AddProfile = ({ mandatory, onCancel, onContinue }: Props) => {
    const [state, setState] = useState<State>({
        isLoading: false,
        error: undefined,
        name: "",
    });

    const isNameValid = useCallback((name: string) => {
        return (name.length > 0) && pattern.test(name);
    }, []);

    const handleOnProfileNameChange = useCallback((e: Event | React.FormEvent<HTMLElement>) => {
        const target = e.target as HTMLInputElement;
        const { value } = target;

        setState({
            ...state,
            name: value,
            error: !isNameValid(value),
        });
    }, [isNameValid]);

    const handleOnContinue = () => {
        const { name } = state;
        if (isNameValid(name)) {
            onContinue(name);
        }
    };

    useEffect(() => {
        // Listen when the user presses Enter.
        // It is useful when creating a new profile.
        // After typing the name pressing enter will trigger the `Continue` button.
        const f = (event: KeyboardEvent) => {
            if (event.key === "Enter") {
                const name = (event.target as HTMLInputElement).value;

                if(name.length && pattern.test(name)) {
                    onContinue(name);
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
            <VSCodeTextField
                id="profileNameInput"
                onInput={(e) => handleOnProfileNameChange(e)}
                value={state.name}
            >
                    Profile Name
            </VSCodeTextField>
            {state.error &&
                <p id="invalidProfileNameErrorMessage">
                    Profile name must contain only ASCII letters, ASCII digits, underscores, and dashes.
                </p>}
            <Actions
                primaryText="Continue"
                secondaryText="Cancel"
                disable={!isNameValid(state.name)}
                hidden={mandatory}
                onSecondaryClick={onCancel}
                onPrimaryClick={handleOnContinue}
            />
        </>
    );
};

export default AddProfile;