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
    update: (state: State) => void;
    refresh: () => Promise<void>;
};

const baseState: State = {
    isLoading: true,
    refresh: async () => {},
    update: () => {},
};

export const Context = createContext<State>({ ...baseState });

interface ContextProviderProps {
    children: JSX.Element;
}

export const ContextProvider = (props: ContextProviderProps): React.JSX.Element => {
    const { children } = props;
    const [state, setState] = useState<State>({ ...baseState });
    console.log("[ContextProvider]");

    const updateContext = useCallback(async (state: State) => {
        setState({
            ...state,
        });
    }, [state]);

    const refreshContext = useCallback(async () => {
        const newState: State = {
            ...state,
            isLoading: true,
            refresh: refreshContext,
            update: updateContext
        };
        setState(newState);

        const { environment, error, profileNames, profileName, } = await request<State>({
            type: "getContext"
        });

        setState({
            refresh: refreshContext,
            update: updateContext,
            isLoading: false,
            environment,
            error,
            profileName,
            profileNames,
        });
    }, [state]);

    useEffect(() => {
        refreshContext();
    }, []);

    return <Context.Provider value={state}>{children}</Context.Provider>;
};

export default ContextProvider;