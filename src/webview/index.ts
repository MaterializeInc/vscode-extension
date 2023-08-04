/*
 * This file imports all the VSCode UX/UI guidelines.
 */
import { provideVSCodeDesignSystem, vsCodeDropdown, vsCodeTextField, vsCodeOption, vsCodeButton, vsCodeDataGrid, vsCodeDataGridCell, vsCodeDataGridRow, vsCodeLink, vsCodeProgressRing, vsCodeDivider } from "@vscode/webview-ui-toolkit";

provideVSCodeDesignSystem().register(vsCodeDropdown(), vsCodeOption(), vsCodeButton(), vsCodeDataGrid(), vsCodeDataGridCell(), vsCodeDataGridRow(), vsCodeLink(), vsCodeTextField(), vsCodeProgressRing(), vsCodeDivider());