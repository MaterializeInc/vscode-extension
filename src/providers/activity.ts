import * as vscode from 'vscode';
import * as path from 'path';

export default class ActivityLogTreeProvider implements vscode.TreeDataProvider<ActivityLogNode> {

    private _onDidChangeTreeData: vscode.EventEmitter<ActivityLogNode | undefined | null | void> = new vscode.EventEmitter<ActivityLogNode | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ActivityLogNode | undefined | null | void> = this._onDidChangeTreeData.event;

    private logs: ActivityLog[] = [];

    constructor(private context: vscode.ExtensionContext) {
        this.logs = this.context.globalState.get('activityLogs') || [];
    }

    addLog(log: ActivityLog) {
        this.logs.push(log);

        // Remove the oldest log if we have more than 100
        if (this.logs.length > 100) {
            this.logs.shift();
        }

        this.context.globalState.update('activityLogs', this.logs);
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ActivityLogNode): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ActivityLogNode): Thenable<ActivityLogNode[]> {
        if (!element) {
            // Revert the logs to show the newest ones at the top
            return Promise.resolve(this.logs.slice().reverse().map(log => new ActivityLogNode(log)));
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
        // Shorten the displayed query if it's too long
        const shortSQL = log.sql.length > 50 ? log.sql.substring(0, 50) + "..." : log.sql;
        // Removes enters and extra spaces.
        const cleanSQL = shortSQL.replace(/\n/g, '').replace(/\s{2,}/g, ' ');
        super(cleanSQL, vscode.TreeItemCollapsibleState.None);

        // Set iconPath based on the status
        const iconName = log.status === "success" ? "success_icon.svg" : "error_icon.svg";
        this.iconPath = vscode.Uri.file(path.join(__dirname, '..', 'resources', iconName));

        // Set the description to the query latency
        this.description = `${log.latency}ms`;

        this.tooltip = `${log.sql}`;
        this.contextValue = 'activityLogItem';
    }
}

class ActivityLogNode extends ActivityLogItem {}
