import { createContext, useCallback, useEffect, useState } from "react";
import * as React from "react";
import { Environment } from "../../context/context";
import { request } from ".";

interface State {
    isLoading: boolean;
    profileName?: string;
    profileNames?: Array<string>;
    error?: string;
    environment?: Environment;
    refresh: () => Promise<void>;
};

const baseState: State = {
    isLoading: true,
    refresh: async () => {},
};

export const Context = createContext<State>({ ...baseState });

interface ContextProviderProps {
    children: JSX.Element;
}

export const ContextProvider = (props: ContextProviderProps): React.JSX.Element => {
    const { children } = props;
    const [state, setState] = useState<State>({ ...baseState });
    console.log("[ContextProvider]");

    const refreshContext = useCallback(async () => {
        const state: State = {
            isLoading: true,
            refresh: refreshContext,
        };
        setState(state);

        const { environment, error, profileNames, profileName, } = await request<State>({
            type: "contextState"
        });

        setState({
            ...state,
            isLoading: false,
            environment,
            error,
            profileName,
            profileNames,
        });
    }, []);

    useEffect(() => {
        refreshContext();
    }, []);

    return <Context.Provider value={state}>{children}</Context.Provider>;
};

export default ContextProvider;