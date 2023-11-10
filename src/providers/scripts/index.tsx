import * as React from "react";
import { ContextProvider } from "./context";
import Profile from "./profile";
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';

// @ts-ignore
const vscode = acquireVsCodeApi();
export const postMessage = (msg: any) => {
  vscode.postMessage(JSON.stringify(msg));
};

export interface Message {
  data?: any;
  type: string;
}

export const request = async (msg: Message): Promise<any> => {
  vscode.postMessage(JSON.stringify(msg));

  return new Promise((res) => {
    const listener = (data: Message) => {
      console.log("[React]", "New message: ", data);
      if (data && data.type === msg.type) {
        console.log("[React]", "Ready to remove listener for: ", msg.type);
        window.removeEventListener("message", listener);
        res(data);
      } else {
        console.log("[React]", "Listener not removed.");
      }
    };
    window.addEventListener("message", listener);
  });
};

/**
 * Log utils. To send logs back to VSCode debug console.
 */
export const logInfo = (...messages: Array<any>) => {
  postMessage({ type: "logInfo", data: { messages } });
};
console.log = logInfo;

export const logError = (error: any) => {
  postMessage({ type: "logError", data: { error } });
};
console.error = logError;

// @ts-ignore
const elm = document.querySelector("#root");

if (elm) {
  const root = createRoot(elm);
  flushSync(() => {
    root.render(<ContextProvider><Profile /></ContextProvider>);
  });
}