import { VSCodeDivider, VSCodeDropdown, VSCodeOption, VSCodeProgressRing } from "@vscode/webview-ui-toolkit/react";
import React, { useContext } from "react";
import Actions from "../utils/actions";
import { Context } from "../context";

interface Props {
    onAddProfileClick: () => void;
    onRemoveProfileClick: () => void;
}

const Configuration = ({ onAddProfileClick, onRemoveProfileClick }: Props) => {
    const {
        environment,
        profileName,
        profileNames,
        error,
        isLoading,
    } = useContext(Context);

    console.log("Is loading: ", isLoading, environment);

    if (profileNames) {
        return (
            <div className="profile-container">
                    {/*
                        <!--  The following container is an extract from the guidelines: -->
                        <!--  https://github.com/microsoft/vscode-webview-ui-toolkit/tree/main/src/dropdown#with-label -->
                    */}
                    <div className="dropdown-container">
                        <label htmlFor="profiles">Profile</label>
                        <VSCodeDropdown id="profiles" disabled={isLoading}>
                            <VSCodeOption>{(profileName)}</VSCodeOption>
                            {profileNames.filter(name => name !== profileName).map((name) => <VSCodeOption>${name}</VSCodeOption>).join('')}
                        </VSCodeDropdown>
                    </div>
                    <Actions primaryText="Add" secondaryText="Remove" onPrimaryClick={onAddProfileClick} onSecondaryClick={onRemoveProfileClick} />
                    <VSCodeDivider></VSCodeDivider>
                    {error && <p className="profileErrorMessage">{error}</p>}
                    {isLoading && <VSCodeProgressRing id="loading-ring"></VSCodeProgressRing>}
                    {(!isLoading && !error && environment) && <span id='options-title'>Connection Options</span>}
                    {(!isLoading && !error && environment) && (
                        <>
                        <div className={`setup-container ${isLoading ? "invisible" :""}`}>
                            <div className="dropdown-container">
                                <label htmlFor="clusters">Cluster</label>
                                <VSCodeDropdown id="clusters">
                                    <VSCodeOption>${environment.cluster}</VSCodeOption>
                                    {environment.clusters.filter(x => x.name !== environment.cluster).map(({name}) => <VSCodeOption>${name}</VSCodeOption>).join('')}
                                </VSCodeDropdown>
                            </div>
                        </div>
                        <div className={`setup-container ${isLoading ? "invisible" :""}`}>
                            <div className="dropdown-container">
                                <label htmlFor="databases">Databases</label>
                                <VSCodeDropdown id="databases">
                                    <VSCodeOption>${environment.cluster}</VSCodeOption>
                                    {environment.databases.filter(x => x.name !== environment.cluster).map(({name}) => <VSCodeOption>${name}</VSCodeOption>).join('')}
                                </VSCodeDropdown>
                            </div>
                        </div>
                        <div className={`setup-container ${isLoading ? "invisible" :""}`}>
                            <div className="dropdown-container">
                                <label htmlFor="schemas">Schema</label>
                                <VSCodeDropdown id="schemas">
                                    <VSCodeOption>${environment.cluster}</VSCodeOption>
                                    {environment.schemas.filter(x => x.name !== environment.cluster).map(({name}) => <VSCodeOption>${name}</VSCodeOption>).join('')}
                                </VSCodeDropdown>
                            </div>
                        </div>
                        </>
                    )}
                </div>
            );
    } else {
        return <></>;
    }
};

export default Configuration;