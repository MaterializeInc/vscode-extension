import { Uri, Webview } from "vscode";
import { Errors, ExtensionError } from "./error";

export function getNonce() {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export function getUri(webview: Webview, extensionUri: Uri, pathList: string[]) {
  return webview.asWebviewUri(Uri.joinPath(extensionUri, ...pathList));
}

export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  timeout = 60000,
  interval = 5000
): Promise<Response> {
  const startTime = Date.now();

  async function attemptFetch(): Promise<Response> {
      try {
          const response = await fetch(url, init);
          return response;
      } catch (error) {
          console.error("[Fetch]", "Error fetching: ", error);
          if (Date.now() - startTime < timeout) {
              await new Promise(resolve => setTimeout(resolve, interval));
              return attemptFetch();
          } else {
              throw new ExtensionError(Errors.fetchTimeoutError, `Failed to fetch after ${timeout}ms: ${error}`);
          }
      }
  }

  return attemptFetch();
}