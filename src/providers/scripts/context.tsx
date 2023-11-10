import { createContext, useEffect, useState } from "react";
import * as React from "react";
import { Environment } from "../../context/context";
import { request } from ".";

interface ContextState {
    isLoading: boolean;
    profileName?: string;
    profileNames?: Array<string>;
    error?: string;
    environment?: Environment
};

const baseState: ContextState = {
    isLoading: false,
};

export const Context = createContext<ContextState>({ ...baseState });

interface ContextProviderProps {
    children: JSX.Element;
}

export const ContextProvider = (props: ContextProviderProps): React.JSX.Element => {
    const { children } = props;
    const [state, setState] = useState<ContextState>({ ...baseState });
    console.log("[ContextProvider]");

    useEffect(() => {
        const asyncOp = async() => {
            setState({
                ...state,
                isLoading: true,
            });

            const { environment, profileName, profileNames, error } = await request({
                type: "contextState"
            });

            setState({
                environment,
                isLoading: false,
                error,
                profileName,
                profileNames,
            });
        };

        asyncOp();
    }, []);

    return <Context.Provider value={state}>{children}</Context.Provider>;
};

export default ContextProvider;