import { createContext, useEffect, useState } from "react";
import * as React from "react";
import { vscode } from "./index";
import { Environment } from "../../context/context";

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
        const listener = ({ data: message }: any) => {
            const { type } = message;
            console.log("[React]", "[Context]", "Message received:", type);

            switch (type) {
                case "contextState": {
                    const { data: context } = message;
                    setState(context);
                }
                case "newProfile": {
                    const { data: { profileName, profileNames } } = message;
                    console.log('[React]', "[Context]", message);
                    setState({
                        ...state,
                        profileName,
                        profileNames
                    });
                }
                case "environmentChange": {
                    setState({
                        ...state,
                        isLoading: true,
                    });
                }
            }
        };
        window.addEventListener('message', (data) => {
            console.log('[React]', data);
        });
        vscode.postMessage({ type: "requestContextState" });

        return () => {
            window.removeEventListener('message', listener);
        }
    }, []);

    return <Context.Provider value={state}>{children}</Context.Provider>;
};

export default ContextProvider;