import { createContext, useCallback, useEffect, useState } from "react";
import * as React from "react";
import { Environment } from "../../context/context";
import { Message, request as extensionRequest } from ".";

interface VSCodeContextState {
    profileName?: string;
    profileNames?: Array<string>;
    environment?: Environment;
    error?: string;
}

interface State extends VSCodeContextState{
    isLoading: boolean;
    error?: string;
    request: (msg: Message) => Promise<void>;
};

const baseState: State = {
    isLoading: true,
    request: async () => {},
};

export const Context = createContext<State>({ ...baseState });

interface ContextProviderProps {
    children: JSX.Element;
}

export const ContextProvider = (props: ContextProviderProps): React.JSX.Element => {
    const { children } = props;
    const [state, setState] = useState<State>({ ...baseState });

    // Mutable request
    const request = useCallback(async (msg: Message) => {
        try {
            setState({
                ...state,
                error: undefined,
                isLoading: true,
                request,
            });
            const newContext: VSCodeContextState = await extensionRequest<VSCodeContextState>(msg);
            console.log("[React]", "[Context]", "New context: ", newContext);

            setState({
                ...newContext,
                isLoading: false,
                request
            });
        } catch (err) {
            console.error(err);
            setState({
                ...state,
                isLoading: false,
                error: "Internal error processing action.",
                request
            });
        }
    }, [state]);

    useEffect(() => {
        request({ type: "getContext" });
    }, []);

    state.request = request;

    return <Context.Provider value={state}>{children}</Context.Provider>;
};

export default ContextProvider;