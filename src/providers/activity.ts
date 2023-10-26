import * as vscode from 'vscode';
import Context, { EventType } from '../context/context';
import path = require('path');

export default class ActivityLogTreeProvider implements vscode.TreeDataProvider<ActivityLogNode> {

    private _onDidChangeTreeData: vscode.EventEmitter<ActivityLogNode | undefined | null | void> = new vscode.EventEmitter<ActivityLogNode | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ActivityLogNode | undefined | null | void> = this._onDidChangeTreeData.event;

    private logs: ActivityLog[] = [];

    addLog(log: ActivityLog) {
        this.logs.push(log);
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ActivityLogNode): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ActivityLogNode): Thenable<ActivityLogNode[]> {
        if (!element) {
            return Promise.resolve(this.logs.map(log => new ActivityLogNode(log)));
        }
        return Promise.resolve([]);
    }
}

interface ActivityLog {
    status: "success" | "failure";
    latency: number;
    sql: string;
}

class ActivityLogItem extends vscode.TreeItem {
    constructor(public readonly log: ActivityLog) {
        super(log.sql, vscode.TreeItemCollapsibleState.None);
        this.description = `${log.status === "success" ? "✅" : "❌"} | Latency: ${log.latency}ms`;
        this.tooltip = log.sql;
        this.contextValue = 'activityLogItem';

        // Copy SQL command to clipboard
        this.command = {
            command: 'extension.copySQL',
            title: 'Copy SQL',
            arguments: [log.sql]
        };
    }
}

class ActivityLogNode extends ActivityLogItem {}
