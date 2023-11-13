import { VSCodeDivider, VSCodeDropdown, VSCodeOption } from "@vscode/webview-ui-toolkit/react";
import React, { useCallback, useContext } from "react";
import Actions from "../utils/actions";
import { Context } from "../context";

interface Props {
    disabled: boolean;
    onAddProfileClick: () => void;
    onRemoveProfileClick: () => void;
    onProfileChange: (name: string) => void;
    onConnectionOptionsChange: (type: string, name: string) => void;
}

const Configuration = ({
    disabled,
    onProfileChange,
    onAddProfileClick,
    onRemoveProfileClick,
    onConnectionOptionsChange,
}: Props) => {
    const {
        environment,
        profileName,
        profileNames,
        error,
        isLoading,
    } = useContext(Context);

    const handleOnProfileChange = useCallback((e: Event | React.FormEvent<HTMLElement>) => {
        const target = e.target as HTMLInputElement;
        onProfileChange(target.value);
    }, [onProfileChange]);

    const handleConnectionOptionsChange = useCallback((e: Event | React.FormEvent<HTMLElement>) => {
        const { id: type, value: name } = e.target as HTMLSelectElement;
        onConnectionOptionsChange(type, name);
    }, []);

    if (profileNames) {
        return (
            <div className="profile-container">
                    {/*
                        <!--  The following container is an extract from the guidelines: -->
                        <!--  https://github.com/microsoft/vscode-webview-ui-toolkit/tree/main/src/dropdown#with-label -->
                    */}
                    <div className="dropdown-container">
                        <label htmlFor="profiles">Profile</label>
                        <VSCodeDropdown onChange={handleOnProfileChange} id="profiles" disabled={isLoading || disabled}>
                            <VSCodeOption>{(profileName)}</VSCodeOption>
                            {profileNames.filter(name => name !== profileName).map((name) => <VSCodeOption key={name}>{name}</VSCodeOption>)}
                        </VSCodeDropdown>
                    </div>
                    <Actions primaryText="Add" secondaryText="Remove" onPrimaryClick={onAddProfileClick} onSecondaryClick={onRemoveProfileClick} />
                    <VSCodeDivider></VSCodeDivider>
                    {error && <p className="profileErrorMessage">{error}</p>}
                    {(!error && environment) && <span id='options-title'>Connection Options</span>}
                    {(!error && environment) && (
                        <>
                        <div className={"setup-container"}>
                            <div className="dropdown-container">
                                <label htmlFor="clusters">Cluster</label>
                                <VSCodeDropdown disabled={isLoading || disabled} onChange={handleConnectionOptionsChange} id="cluster">
                                    <VSCodeOption>{environment.cluster}</VSCodeOption>
                                    {environment.clusters.filter(x => x.name !== environment.cluster).map(({name}) => <VSCodeOption key={name.toString()}>{name}</VSCodeOption>)}
                                </VSCodeDropdown>
                            </div>
                        </div>
                        <div className={"setup-container"}>
                            <div className="dropdown-container">
                                <label htmlFor="databases">Databases</label>
                                <VSCodeDropdown disabled={isLoading || disabled} onChange={handleConnectionOptionsChange} id="database">
                                    <VSCodeOption>{environment.database}</VSCodeOption>
                                    {environment.databases.filter(x => x.name !== environment.database).map(({name}) => <VSCodeOption key={name.toString()}>{name}</VSCodeOption>)}
                                </VSCodeDropdown>
                            </div>
                        </div>
                        <div className={"setup-container"}>
                            <div className="dropdown-container">
                                <label htmlFor="schemas">Schema</label>
                                <VSCodeDropdown disabled={isLoading || disabled} onChange={handleConnectionOptionsChange} id="schema" >
                                    <VSCodeOption>{environment.schema}</VSCodeOption>
                                    {environment.schemas.filter(x => x.name !== environment.schema).map(({name}) => <VSCodeOption key={name.toString()}>{name}</VSCodeOption>)}
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