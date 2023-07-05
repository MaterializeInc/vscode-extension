/*
 * This file imports all the VSCode UX/UI guidelines.
 */
import { provideVSCodeDesignSystem, vsCodeDropdown, vsCodeTextField, vsCodeOption, vsCodeButton, vsCodeDataGrid, vsCodeDataGridCell, vsCodeDataGridRow, vsCodeLink } from "@vscode/webview-ui-toolkit";

provideVSCodeDesignSystem().register(vsCodeDropdown(), vsCodeOption(), vsCodeButton(), vsCodeDataGrid(), vsCodeDataGridCell(), vsCodeDataGridRow(), vsCodeLink(), vsCodeTextField());