import * as React from "react";
import * as Server from 'react-dom/server';
import { ContextProvider } from "./context";
import Profile from "./profile";

// @ts-ignore
export const vscode = acquireVsCodeApi();

/**
 * Log utils. To send logs back to VSCode debug console.
 */
export const logInfo = (...messages: Array<any>) => {
    vscode.postMessage(JSON.stringify({ type: "logInfo", data: { messages } }));
};
console.log = logInfo;

export const logError = (error: any) => {
vscode.postMessage(JSON.stringify({ type: "logError", data: { error } }));
};
console.error = logError;

window.addEventListener("message", (data) => {
    console.log("[React]", "[Context]","Stuff: ", data);
});

// @ts-ignore
const elm = document.querySelector("#root");

if (elm) {
  elm.innerHTML = "<div>Hi</div>";
  elm.innerHTML = Server.renderToString(<ContextProvider><Profile /></ContextProvider>);
}