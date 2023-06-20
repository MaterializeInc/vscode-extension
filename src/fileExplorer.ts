import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export default class FileTreeProvider implements vscode.TreeDataProvider<File> {

    private _onDidChangeTreeData: vscode.EventEmitter<File | undefined | null | void> = new vscode.EventEmitter<File | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<File | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private workspaceRoot: string) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: File): vscode.TreeItem {
        return element;
    }

    getChildren(element?: File): Thenable<File[]> {
        if (!this.workspaceRoot) {
            vscode.window.showInformationMessage('No dependency in empty workspace');
            return Promise.resolve([]);
        }

        if (element) {
            return Promise.resolve(this.getFilesFromDirectory(element.resourceUri.fsPath));
        } else {
            let files = this.getFilesFromDirectory(this.workspaceRoot);
            return Promise.resolve(files);
        }
    }

    /**
     * Given the path to directory, return all files
     */
    private getFilesFromDirectory(dirPath: string): File[] {
        const files = fs.readdirSync(dirPath);
        const children = files.map((file) => {
            const filePath = path.join(dirPath, file);
            const state = fs.statSync(filePath);
            const treeItem = new File(vscode.Uri.file(filePath), state.isDirectory() ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
            return treeItem;
        });

        return children;
    }
}

class File extends vscode.TreeItem {
    constructor(
        public readonly resourceUri: vscode.Uri,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    ) {
        super(resourceUri, collapsibleState);
        this.tooltip = `${this.resourceUri.fsPath}`;
        this.description = this.resourceUri.fsPath;
    }

    contextValue = 'file';
}