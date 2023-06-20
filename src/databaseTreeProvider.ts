import * as vscode from 'vscode';
import { Profile } from './authProvider';
import { Pool } from 'pg';
import path = require('path');

export default class DatabaseTreeProvider implements vscode.TreeDataProvider<Node> {

    private _onDidChangeTreeData: vscode.EventEmitter<Node | undefined | null | void> = new vscode.EventEmitter<Node | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<Node | undefined | null | void> = this._onDidChangeTreeData.event;
    private client: Promise<Pool>;

    constructor(private profile?: Profile) {
        let pool = new Pool({
            host: process.env.MZ_HOST,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            application_name: "mz_vscode",
            port: 6875,
            user: process.env.MZ_USER,
            password: process.env.MZ_PASSWORD,
            ssl: true,
        });

        this.client = new Promise((res, rej) => {
            pool.connect((err) => {
                if (err) {
                    rej(err);
                } else {
                    res(pool);
                }
            });
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: Node): vscode.TreeItem {
        return element;
    }

    getChildren(element?: Node): Thenable<Node[]> {
        // TODO: Reactivate this after enabling profiles.
        // if (!this.profile) {
        //     vscode.window.showInformationMessage('No profile available.');
        //     return Promise.resolve([]);
        // }

        if (element) {
            console.log("Getting children.");
            return Promise.resolve(this.getChildrenFromNode(element));
        } else {
            // Returns databases
            console.log("Getting databases");
            return Promise.resolve(this.getDatabases());
        }
    }

    private async query(text: string, vals?: Array<any>) {
        let client = await this.client;
        return client.query(text, vals);
    }

    private async getChildrenFromNode(element: Node): Promise<Array<Node>> {
        switch (element.contextValue) {
            case "database":
                return this.getSchemas(element.props.id);
            case "schema":
                return this.getObjects(element.props.id);
            default:
                return new Promise((res, ) => res([]));
        }
    }

    private async getObjects(schema: String): Promise<Array<Node>> {
        const materializedViews: Promise<Array<Node>> = new Promise((res, rej) => {
            this.query("SELECT id, name, owner_id, cluster_id FROM mz_materialized_views WHERE schema_id = $1", [schema]).then((results) => {
                let materializedViews = results.rows.map(({ id, name, owner_id: ownerId }) => {
                    return new MaterializedView(name, vscode.TreeItemCollapsibleState.None, { id, name, ownerId });
                });
                res(materializedViews);
            }).catch(rej);
        });

        const views: Promise<Array<Node>> = new Promise((res, rej) => {
            this.query("SELECT id, name, owner_id FROM mz_views WHERE schema_id = $1", [schema]).then((results) => {
                let views = results.rows.map(({ id, name, owner_id: ownerId }) => {
                    return new View(name, vscode.TreeItemCollapsibleState.None, { id, name, ownerId });
                });
                res(views);
            }).catch(rej);
        });

        const tables: Promise<Array<Node>> = new Promise((res, rej) => {
            this.query("SELECT id, name, owner_id FROM mz_tables WHERE schema_id = $1", [schema]).then((results) => {
                let tables = results.rows.map(({ id, name, owner_id: ownerId }) => {
                    return new Table(name, vscode.TreeItemCollapsibleState.None, { id, name, ownerId });
                });
                res(tables);
            }).catch(rej);
        });

        let promise = await Promise.all<Array<Node>>([materializedViews, views, tables]);
        return promise.flatMap(x => x);
    }

    private async getSchemas(database: String): Promise<Array<Schema>> {
        return new Promise((res, rej) => {
            this.query("SELECT id, name, owner_id FROM mz_schemas WHERE database_id = $1", [database]).then((results) => {
                const schemas = results.rows.map(({ id, name, owner_id: ownerId }) => {
                    return new Schema(name, vscode.TreeItemCollapsibleState.Collapsed, { id, name, ownerId });
                });
                res(schemas);
            }).catch(rej);
        });
    }

    private async getDatabases(): Promise<Array<Database>> {
        return new Promise((res, rej) => {
            this.query("SELECT id, name, owner_id FROM mz_databases").then((results) => {
                const databases = results.rows.map(({ id, name, owner_id: ownerId }) => {
                    return new Database(name, vscode.TreeItemCollapsibleState.Collapsed, { id, name, ownerId });
                });
                res(databases);
            }).catch(rej);
        });
    }
}


interface Queryable {
 getChildren(): Array<Node>
};

type Node = Database | Schema | MaterializedView | View | Table;

interface Props {
    name: String,
    id: String,
    ownerId: String
}

class Database extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly props: Props
    ) {
        super(label, collapsibleState);

        this.tooltip = props.name.toString();
        this.description = props.id.toString();
    }

    contextValue = 'database';
}

class Schema extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly props: Props
    ) {
        super(label, collapsibleState);

        this.tooltip = props.name.toString();
        this.description = props.id.toString();
    }

    contextValue = 'schema';
}

class MaterializedView extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly props: Props
    ) {
        super(label, collapsibleState);

        this.tooltip = props.name.toString();
        this.description = props.id.toString();
    }

    contextValue = 'materializedview';
}

class View extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly props: Props
    ) {
        super(label, collapsibleState);

        this.tooltip = props.name.toString();
        this.description = props.id.toString();
    }

    contextValue = 'view';
}

// class Source extends vscode.TreeItem {
//     constructor(
//         public readonly resourceUri: vscode.Uri,
//         public readonly collapsibleState: vscode.TreeItemCollapsibleState,
//     ) {
//         super(resourceUri, collapsibleState);
//         this.tooltip = `${this.resourceUri.fsPath}`;
//         this.description = this.resourceUri.fsPath;
//     }

//     contextValue = 'source';
// }

// class Sink extends vscode.TreeItem {
//     constructor(
//         public readonly resourceUri: vscode.Uri,
//         public readonly collapsibleState: vscode.TreeItemCollapsibleState,
//     ) {
//         super(resourceUri, collapsibleState);
//         this.tooltip = `${this.resourceUri.fsPath}`;
//         this.description = this.resourceUri.fsPath;
//     }

//     contextValue = 'sink';
// }

class Table extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly props: Props
    ) {
        super(label, collapsibleState);

        this.tooltip = props.name.toString();
        this.description = props.id.toString();
    }

    contextValue = 'table';
}