import * as vscode from 'vscode';
import Context, { EventType } from '../context/context';
import path = require('path');

export default class DatabaseTreeProvider implements vscode.TreeDataProvider<Node> {

    private _onDidChangeTreeData: vscode.EventEmitter<Node | undefined | null | void> = new vscode.EventEmitter<Node | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<Node | undefined | null | void> = this._onDidChangeTreeData.event;
    private context: Context;

    constructor(context: Context) {
        this.context = context;
        this.context.on("event", ({ type }) => {
            if (type === EventType.profileChange) {
                console.log("[DatabaseTreeProvider]", "Profile change detected. Refreshing provider.");
                this.refresh();
            }
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: Node): vscode.TreeItem {
        return element;
    }

    getChildren(element?: Node): Thenable<Node[]> {
        if (element) {
            console.log("[DatabaseTreeProvider]", "Getting children.");
            return Promise.resolve(this.getChildrenFromNode(element));
        } else {
            console.log("[DatabaseTreeProvider]", "Getting databases.");
            return new Promise((res, rej) => {
                // EventType.newSchemas
                this.context.on("event", ({ type }) => {
                    switch (type) {
                        case EventType.environmentLoaded: {
                            console.log("[DatabaseTreeProvider]", "Environment loaded.");
                            const schema = this.context.getSchema();
                            if (schema) {
                                res([
                                    new SourceTab("Sources", vscode.TreeItemCollapsibleState.Collapsed, schema),
                                    new ViewTab("Views", vscode.TreeItemCollapsibleState.Collapsed, schema),
                                    new MaterializedViewTab("Materialized Views", vscode.TreeItemCollapsibleState.Collapsed, schema),
                                    new TableTab("Tables", vscode.TreeItemCollapsibleState.Collapsed, schema),
                                    new SinkTab("Sinks", vscode.TreeItemCollapsibleState.Collapsed, schema)
                                ]);
                            } else {
                                // TODO: Wrong state.
                                console.error("[DatabaseTreeProvider]", "Error wrong state. Missing schema.");
                                rej(new Error("Missing schema."));
                            }
                        }
                    }
                });
            });
        }
    }

    private async query(text: string, vals?: Array<any>): Promise<Array<any>> {
        const pool = this.context.sqlClient && await this.context.sqlClient.pool;
        if (pool) {
            return (await pool.query(text, vals)).rows;
        }

        return [];
    }

    private async getChildrenFromNode(element: Node): Promise<Array<Node>> {
        switch (element.contextValue) {
            case ContextValue.database:
                return this.getSchemas(element.props.id);
            case ContextValue.schema:
                // return this.getObjects(element.props.id);
                // TODO: Correct type; avoid casting.
                return [
                    new SourceTab("Sources", vscode.TreeItemCollapsibleState.Collapsed, element.props as MaterializeObject),
                    new ViewTab("Views", vscode.TreeItemCollapsibleState.Collapsed, element.props as MaterializeObject),
                    new MaterializedViewTab("Materialized Views", vscode.TreeItemCollapsibleState.Collapsed, element.props as MaterializeObject),
                    new TableTab("Tables", vscode.TreeItemCollapsibleState.Collapsed, element.props as MaterializeObject),
                    new SinkTab("Sinks", vscode.TreeItemCollapsibleState.Collapsed, element.props as MaterializeObject)
                ];
            case ContextValue.viewTab:
                return this.getViews(element.props.id);
            case ContextValue.materializedViewTab:
                return this.getMaterializedViews(element.props.id);
            case ContextValue.sourceTab:
                return this.getSources(element.props.id);
            case ContextValue.tableTab:
                return this.getTables(element.props.id);
            case ContextValue.sinkTab:
                return this.getSinks(element.props.id);
            case ContextValue.table:
                return this.getColumns(element.props.id);
            case ContextValue.source:
                return this.getColumns(element.props.id);
            case ContextValue.materializedView:
                return this.getColumns(element.props.id);
            case ContextValue.view:
                return this.getColumns(element.props.id);
            case ContextValue.sink:
                return this.getColumns(element.props.id);
            default:
                return new Promise((res, ) => res([]));
        }
    }

    private async getSources(schema: String): Promise<Array<Node>> {
        const views: Promise<Array<Node>> = new Promise((res, rej) => {
            this.query("SELECT id, name, owner_id FROM mz_sources WHERE schema_id = $1", [schema]).then((results) => {
                let views = results.map(({ id, name, owner_id: ownerId }) => {
                    return new View(name, vscode.TreeItemCollapsibleState.Collapsed, { id, name, ownerId });
                });
                res(views);
            }).catch(rej);
        });

        return views;
    }

    private async getSinks(schema: String): Promise<Array<Node>> {
        const views: Promise<Array<Node>> = new Promise((res, rej) => {
            this.query("SELECT id, name, owner_id FROM mz_sinks WHERE schema_id = $1", [schema]).then((results) => {
                let views = results.map(({ id, name, owner_id: ownerId }) => {
                    return new View(name, vscode.TreeItemCollapsibleState.Collapsed, { id, name, ownerId });
                });
                res(views);
            }).catch(rej);
        });

        return views;
    }

    private async getViews(schema: String): Promise<Array<Node>> {
        const views: Promise<Array<Node>> = new Promise((res, rej) => {
            this.query("SELECT id, name, owner_id FROM mz_views WHERE schema_id = $1", [schema]).then((results) => {
                let views = results.map(({ id, name, owner_id: ownerId }) => {
                    return new View(name, vscode.TreeItemCollapsibleState.Collapsed, { id, name, ownerId });
                });
                res(views);
            }).catch(rej);
        });

        return views;
    }

    private async getMaterializedViews(schema: String): Promise<Array<Node>> {
        const materializedViews: Promise<Array<Node>> = new Promise((res, rej) => {
            this.query("SELECT id, name, owner_id, cluster_id FROM mz_materialized_views WHERE schema_id = $1", [schema]).then((results) => {
                let materializedViews = results.map(({ id, name, owner_id: ownerId }) => {
                    return new MaterializedView(name, vscode.TreeItemCollapsibleState.Collapsed, { id, name, ownerId });
                });
                res(materializedViews);
            }).catch(rej);
        });

        return materializedViews;
    }

    private async getTables(schema: String): Promise<Array<Node>> {
        const tables: Promise<Array<Node>> = new Promise((res, rej) => {
            this.query("SELECT id, name, owner_id FROM mz_tables WHERE schema_id = $1", [schema]).then((results) => {
                let tables = results.map(({ id, name, owner_id: ownerId }) => {
                    return new Table(name, vscode.TreeItemCollapsibleState.Collapsed, { id, name, ownerId });
                });
                res(tables);
            }).catch(rej);
        });

        return tables;
    }

    private async getObjects(schema: String): Promise<Array<Node>> {
        const materializedViews: Promise<Array<Node>> = new Promise((res, rej) => {
            this.query("SELECT id, name, owner_id, cluster_id FROM mz_materialized_views WHERE schema_id = $1", [schema]).then((results) => {
                let materializedViews = results.map(({ id, name, owner_id: ownerId }) => {
                    return new MaterializedView(name, vscode.TreeItemCollapsibleState.Collapsed, { id, name, ownerId });
                });
                res(materializedViews);
            }).catch(rej);
        });

        const views: Promise<Array<Node>> = new Promise((res, rej) => {
            this.query("SELECT id, name, owner_id FROM mz_views WHERE schema_id = $1", [schema]).then((results) => {
                let views = results.map(({ id, name, owner_id: ownerId }) => {
                    return new View(name, vscode.TreeItemCollapsibleState.Collapsed, { id, name, ownerId });
                });
                res(views);
            }).catch(rej);
        });

        const tables: Promise<Array<Node>> = new Promise((res, rej) => {
            this.query("SELECT id, name, owner_id FROM mz_tables WHERE schema_id = $1", [schema]).then((results) => {
                let tables = results.map(({ id, name, owner_id: ownerId }) => {
                    return new Table(name, vscode.TreeItemCollapsibleState.Collapsed, { id, name, ownerId });
                });
                res(tables);
            }).catch(rej);
        });

        let promise = await Promise.all<Array<Node>>([materializedViews, views, tables]);
        return promise.flatMap(x => x);
    }

    private async getSchemas(database: String): Promise<Array<Schema>> {
        return new Promise((res, rej) => {
            this.query("SELECT id, name, database_id, owner_id FROM mz_schemas WHERE database_id = $1", [database]).then((results) => {
                const schemas = results.map(({ id, name, owner_id: ownerId }) => {
                    return new Schema(name, vscode.TreeItemCollapsibleState.Collapsed, { id, name, ownerId });
                });
                res(schemas);
            }).catch(rej);
        });
    }

    private async getDatabases(): Promise<Array<Database>> {
        return new Promise((res, rej) => {
            this.query("SELECT id, name, owner_id FROM mz_databases").then((results) => {
                const databases = results.map(({ id, name, owner_id: ownerId }) => {
                    return new Database(name, vscode.TreeItemCollapsibleState.Collapsed, { id, name, ownerId });
                });
                console.log("[DatabaseTreeProvider]", "Datbases: ", databases);

                res(databases);
            }).catch(rej);
        });
    }

    private async getColumns(id: String): Promise<Array<Column>> {
        return new Promise((res, rej) => {
            this.query("SELECT name, type FROM mz_columns WHERE id = $1", [id]).then((results) => {
                const columns = results.map(({ name, type }) => {
                    return new Column(name, vscode.TreeItemCollapsibleState.None, { id: name, type });
                });
                console.log("[DatabaseTreeProvider]", "Columns: ", columns);

                res(columns);
            }).catch(rej);
        });
    }
}

enum ContextValue {
    table = "table",
    column = "column",
    materializedView = "materialized_view",
    view = "view",
    source = "source",
    sink = "sink",
    tableTab = "tableTab",
    materializedViewTab = "materializedViewTab",
    viewTab = "viewTab",
    sourceTab = "sourceTab",
    sinkTab = "sinkTab",
    schema = "schema",
    database = "database",
}

type Node = Database | Schema | MaterializedView | View | Table | Column;

export interface MaterializeObject {
    name: String,
    id: String,
    ownerId: String
}

export interface MaterializeSchemaObject extends MaterializeObject {
    databaseId: String
}

class Database extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly props: MaterializeObject,
        public readonly iconPath = {
            light: path.join(__filename, '..', '..', 'resources', 'database.svg'),
            dark: path.join(__filename, '..', '..', 'resources', 'database.svg')
        }
    ) {
        super(label, collapsibleState);

        this.tooltip = props.name.toString();
    }

    contextValue = ContextValue.database;
}

class Schema extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly props: MaterializeObject
    ) {
        super(label, collapsibleState);

        this.tooltip = props.name.toString();
    }

    contextValue = ContextValue.schema;
}

class MaterializedView extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly props: MaterializeObject
    ) {
        super(label, collapsibleState);

        this.tooltip = props.name.toString();
    }

    contextValue = ContextValue.materializedView;
}

class ViewTab extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly props: MaterializeObject
    ) {
        super(label, collapsibleState);

        this.tooltip = props.name.toString();
    }

    contextValue = ContextValue.viewTab;
}

class MaterializedViewTab extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly props: MaterializeObject
    ) {
        super(label, collapsibleState);

        this.tooltip = props.name.toString();
    }

    // TODO: Give enum to context value.
    contextValue = ContextValue.materializedViewTab;
}

class TableTab extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly props: MaterializeObject
    ) {
        super(label, collapsibleState);

        this.tooltip = props.name.toString();
    }

    // TODO: Give enum to context value.
    contextValue = ContextValue.tableTab;
}

class SinkTab extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly props: MaterializeObject
    ) {
        super(label, collapsibleState);

        this.tooltip = props.name.toString();
    }

    // TODO: Give enum to context value.
    contextValue = ContextValue.sinkTab;
}

class SourceTab extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly props: MaterializeObject
    ) {
        super(label, collapsibleState);

        this.tooltip = props.name.toString();
    }

    contextValue = ContextValue.sourceTab;
}

class View extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly props: MaterializeObject
    ) {
        super(label, collapsibleState);

        this.tooltip = props.name.toString();
    }

    contextValue = ContextValue.view;
}

class Source extends vscode.TreeItem {
    constructor(
        public readonly resourceUri: vscode.Uri,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    ) {
        super(resourceUri, collapsibleState);
        this.tooltip = `${this.resourceUri.fsPath}`;
        this.description = this.resourceUri.fsPath;
    }

    contextValue = ContextValue.source;
}

class Sink extends vscode.TreeItem {
    constructor(
        public readonly resourceUri: vscode.Uri,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    ) {
        super(resourceUri, collapsibleState);
        this.tooltip = `${this.resourceUri.fsPath}`;
        this.description = this.resourceUri.fsPath;
    }

    contextValue = ContextValue.sink;
}

class Table extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly props: MaterializeObject
    ) {
        super(label, collapsibleState);

        this.tooltip = props.name.toString();
    }

    contextValue = ContextValue.table;
}

interface ColumnProps {
    id: String,
    type: String,
}

class Column extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly props: ColumnProps
    ) {
        super(label, collapsibleState);

        this.tooltip = props.id.toString();
        this.description = props.type.toString();
    }

    contextValue = ContextValue.column;
}