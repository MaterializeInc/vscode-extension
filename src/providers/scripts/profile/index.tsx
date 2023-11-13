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
}

// eslint-disable-next-line @typescript-eslint/naming-convention
const Profile = () => {
    const context = useContext(Context);
    const {
        profileName,
        profileNames,
        isLoading,
        error,
        request,
    } = context;
    const [state, setState] = useState<State>({
        isAddNewProfile: false,
        isRemoveProfile: false,
    });

    const handleAddProfile = useCallback(async (name: string) => {
        try {
            await request({ type: "onAddProfile", data: { name } });
            setState({...state, isAddNewProfile: false });
        } catch (err) {
            // TODO: Set error.
        }
    }, [state, request]);

    const handleOnCancelAddProfile = useCallback(() => {
        setState({ ...state, isAddNewProfile: false });
    }, [state]);

    const handleOnCancelRemoveProfile = useCallback(() => {
        setState({ ...state, isRemoveProfile: false, });
    }, [state]);

    const handleOnRemoveProfile = useCallback(async () => {
        setState({
            ...state,
            isRemoveProfile: false,
        });
        await request({ type: "onRemoveProfile", data: { name: profileName } });
    }, [state, profileName, request]);

    const handleOnAddProfileClick = useCallback(() => {
        setState({ ...state, isAddNewProfile: true });
    }, [state]);

    const handleOnRemoveProfileClick = useCallback(() => {
        setState({ ...state, isRemoveProfile: true });
    }, [state]);

    const handleOnProfileChange = useCallback(async (name: string) => {
        try {
            setState({ ...state, });
            await request({ type: "onProfileChange", data: { name } });
            setState({...state, isAddNewProfile: false, });
        } catch (err) {
            console.error("[React]", "[Profile]", err);
            // TODO: Set error.
        }
    }, [state, request]);

    const handleOnConnectionOptionsChange = useCallback(async (type: string, name: string) => {
        try {
            const { environment } = context;
            await request({ type: "onConfigChange", data: { type, name } });

            if (environment) {
                switch (type) {
                    case "cluster":
                        environment.cluster = name;
                        break;

                    case "database":
                        environment.database = name;
                        break;

                    case "schema":
                        environment.schema = name;
                        break;
                    default:
                        break;
                }
            }
        } catch (err) {
            console.error(err);
            // TODO: Set error.
        }
    }, [context]);

    let content = isLoading ? <VSCodeProgressRing id="loading-ring"></VSCodeProgressRing> : <AddProfile onContinue={handleAddProfile} mandatory />;

    if (profileNames) {
        if (state.isAddNewProfile) {
            content = <AddProfile onContinue={handleAddProfile} onCancel={handleOnCancelAddProfile} mandatory={false} />;
        } else if (state.isRemoveProfile) {
            content = <RemoveProfile onCancel={handleOnCancelRemoveProfile} onContinue={handleOnRemoveProfile} />;
        } else {
            content = <Configuration
                disabled={isLoading}
                onAddProfileClick={handleOnAddProfileClick}
                onRemoveProfileClick={handleOnRemoveProfileClick}
                onProfileChange={handleOnProfileChange}
                onConnectionOptionsChange={handleOnConnectionOptionsChange}
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