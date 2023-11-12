import * as React from "react";
import { useCallback, useContext, useState } from "react";
import { Context } from "../context";
import AddProfile from "./add";
import RemoveProfile from "./remove";
import Configuration from "./cofiguration";
import { request } from "..";
import { VSCodeProgressRing } from "@vscode/webview-ui-toolkit/react";

interface State {
    isAddNewProfile: boolean;
    isRemoveProfile: boolean;
    isLoading: boolean;
    error?: string;
    newProfileName?: string;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
const Profile = () => {
    const {
        profileNames,
        isLoading: isContextLoading
    } = useContext(Context);
    const [state, setState] = useState<State>({
        isAddNewProfile: false,
        isRemoveProfile: false,
        isLoading: false,
        error: undefined,
    });

    const handleAddProfile = useCallback(async (name: string) => {
        try {
            setState({...state, isLoading: true, });
            await request({ type: "onAddProfile", data: { name } });
            setState({...state, isAddNewProfile: false, });
        } catch (err) {
            // TODO: Set error.
        }
    }, [state]);

    const handleOnCancelAddProfile = useCallback(() => {
        setState({
            ...state,
            isAddNewProfile: false,
        });
    }, [state]);

    const handleOnCancelRemoveProfile = useCallback(() => {
        setState({
            ...state,
            isRemoveProfile: false,
        });
    }, [state]);

    const handleOnRemoveProfile = useCallback(() => {
        setState({ ...state, isRemoveProfile: false });
    }, [state]);

    const handleOnAddProfileClick = useCallback(() => {
        setState({ ...state, isAddNewProfile: true });
    }, [state]);

    const handleOnRemoveProfileClick = useCallback(() => {
        setState({ ...state, isRemoveProfile: true });
    }, [state]);

    const handleOnProfileChange = useCallback(async (name: string) => {
        try {
            setState({...state, isLoading: true, });
            await request({ type: "onProfileChange", data: { name } });
            setState({...state, isAddNewProfile: false, });
        } catch (err) {
            // TODO: Set error.
        }
    }, [state]);

    let content = isContextLoading ? <VSCodeProgressRing id="loading-ring"></VSCodeProgressRing> : <AddProfile onContinue={handleAddProfile} mandatory />;

    if (profileNames) {
        if (state.isAddNewProfile) {
            content = <AddProfile onContinue={handleAddProfile} onCancel={handleOnCancelAddProfile} mandatory={false} />;
        } else if (state.isRemoveProfile) {
            content = <RemoveProfile onCancel={handleOnCancelRemoveProfile} onContinue={handleOnRemoveProfile} />;
        } else {
            content = <Configuration
                onAddProfileClick={handleOnAddProfileClick}
                onRemoveProfileClick={handleOnRemoveProfileClick}
                onProfileChange={handleOnProfileChange}
            />;
        }
    }

    return (
        <div id="container">
            <div id="logoContainer">
                {/* <img id="logo" src={context.getLogoUri()} alt="Materialize Logo" /> */}
            </div>
            {content}
        </div>
    );
};

export default Profile;