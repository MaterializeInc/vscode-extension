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
            if (type === EventType.environmentLoaded) {
                console.log("[DatabaseTreeProvider]", "Environment change detected. Refreshing provider.");
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
            return new Promise((res) => {
                const asyncOp = async () => {
                    console.log("[DatabaseTreeProvider]", "Looking up the schema.");
                    const schema = this.context.getSchema();
                    if (schema) {
                        res([
                            new SourceTab("Sources", vscode.TreeItemCollapsibleState.Collapsed, schema),
                            new ViewTab("Views", vscode.TreeItemCollapsibleState.Collapsed, schema),
                            new MaterializedViewTab("Materialized Views", vscode.TreeItemCollapsibleState.Collapsed, schema),
                            new TableTab("Tables", vscode.TreeItemCollapsibleState.Collapsed, schema),
                            new SinkTab("Sinks", vscode.TreeItemCollapsibleState.Collapsed, schema),
                            new CatalogTab("Catalog", vscode.TreeItemCollapsibleState.Collapsed, schema),
                            new InternalTab("Internal", vscode.TreeItemCollapsibleState.Collapsed, schema)
                        ]);
                    } else {
                        // A missing schema indicates the the environment is not loaded yet.
                        res ([]);
                    }
                };

                asyncOp();
            });
        }
    }

    private async query(text: string, vals?: Array<any>): Promise<Array<any>> {
        const { rows } =  await this.context.query(text, vals);

        return rows;
    }

    private async getChildrenFromNode(element: Node): Promise<Array<Node>> {
        switch (element.contextValue) {
            case ContextValue.database:
                return this.getSchemas(element.props.id);
            case ContextValue.schema:
                return [
                    new SourceTab("Sources", vscode.TreeItemCollapsibleState.Collapsed, element.props as MaterializeObject),
                    new ViewTab("Views", vscode.TreeItemCollapsibleState.Collapsed, element.props as MaterializeObject),
                    new MaterializedViewTab("Materialized Views", vscode.TreeItemCollapsibleState.Collapsed, element.props as MaterializeObject),
                    new TableTab("Tables", vscode.TreeItemCollapsibleState.Collapsed, element.props as MaterializeObject),
                    new SinkTab("Sinks", vscode.TreeItemCollapsibleState.Collapsed, element.props as MaterializeObject),
                    new CatalogTab("Catalog", vscode.TreeItemCollapsibleState.Collapsed, element.props as MaterializeObject),
                    new InternalTab("Internal", vscode.TreeItemCollapsibleState.Collapsed, element.props as MaterializeObject),
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
            case ContextValue.catalogTab:
                return this.getCatalog();
            case ContextValue.internalTab:
                return this.getInternal();
            default:
                return new Promise((res, ) => res([]));
        }
    }

    private async getCatalog(): Promise<Array<Node>> {
        const catalogSchemaId = "s1";

        const views = this.getViews(catalogSchemaId);
        const tables = this.getTables(catalogSchemaId);
        return (await Promise.all([views, tables])).flatMap(x => x);
    }

    private async getInternal(): Promise<Array<Node>> {
        const internalSchemaId = "s4";

        const views = this.getViews(internalSchemaId);
        const tables = this.getTables(internalSchemaId);
        return (await Promise.all([views, tables])).flatMap(x => x);
    }

    private async getSources(schema: String): Promise<Array<Node>> {
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
    catalogTab = "catalogTab",
    internalTab = "internalTab",
    schema = "schema",
    database = "database",
}

type Node = Schema | MaterializedView | View | Table | Column;

export interface MaterializeObject {
    name: String,
    id: String,
    ownerId: String
}

export interface MaterializeSchemaObject extends MaterializeObject {
    databaseId: String
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

    contextValue = ContextValue.sinkTab;
}

class CatalogTab extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly props: MaterializeObject
    ) {
        super(label, collapsibleState);

        this.tooltip = props.name.toString();
    }

    contextValue = ContextValue.catalogTab;
}

class InternalTab extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly props: MaterializeObject
    ) {
        super(label, collapsibleState);

        this.tooltip = props.name.toString();
    }

    contextValue = ContextValue.internalTab;
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