import * as React from "react";
import { useCallback, useContext, useState } from "react";
import { Context } from "../context";
import AddProfile from "./add";
import RemoveProfile from "./remove";
import Configuration from "./cofiguration";
import { request } from "..";

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
    } = useContext(Context);
    const [state, setState] = useState<State>({
        isAddNewProfile: false,
        isRemoveProfile: false,
        isLoading: false,
        error: undefined,
    });

    const handleAddProfile = useCallback(async (name: string) => {
        setState({...state, isLoading: true, });
        await request({ type: "onAddProfile", data: { name } });
        setState({...state, isAddNewProfile: false, });
    }, []);

    const handleOnCancelAddProfile = useCallback(() => {
        setState({
            ...state,
            isAddNewProfile: false,
        });
    }, []);

    const handleOnCancelRemoveProfile = useCallback(() => {
        setState({
            ...state,
            isRemoveProfile: false,
        });
    }, []);

    const handleOnRemoveProfile = useCallback(() => {
        setState({...state, isRemoveProfile: true });
    }, []);

    const handleOnAddProfileClick = useCallback(() => {
        setState({...state, isAddNewProfile: true});
    }, []);

    let content = <AddProfile onContinue={handleAddProfile} mandatory />;

    if (profileNames) {
        if (state.isAddNewProfile) {
            content = <AddProfile onContinue={handleAddProfile} onCancel={handleOnCancelAddProfile} mandatory={false} />;
        } else if (state.isRemoveProfile) {
            content = <RemoveProfile onCancel={handleOnCancelRemoveProfile} onContinue={handleOnRemoveProfile} />;
        } else {
            content = <Configuration
                onAddProfileClick={handleOnAddProfileClick}
                onRemoveProfileClick={handleOnRemoveProfile}
            />;
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