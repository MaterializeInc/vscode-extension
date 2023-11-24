import { AdminClient, CloudClient, SqlClient } from "../clients";
import { ExtensionContext } from "vscode";
import { Context, SchemaObject, SchemaObjectColumn } from "./context";
import { Errors, ExtensionError } from "../utilities/error";
import AppPassword from "./appPassword";
import { ActivityLogTreeProvider, AuthProvider, DatabaseTreeProvider, ResultsProvider } from "../providers";
import * as vscode from 'vscode';
import { QueryArrayResult, QueryResult } from "pg";
import { ExecuteCommandParseStatement } from "../clients/lsp";
import { MaterializeObject } from "../providers/schema";

/**
 * Represents the different providers available in the extension.
 */
interface Providers {
    activity: ActivityLogTreeProvider;
    database: DatabaseTreeProvider;
    auth: AuthProvider;
    results: ResultsProvider;
}

/**
 * The context serves as a centralized point for handling
 * asynchronous calls and distributing errors.
 *
 * All asynchronous methods should be declared in this class
 * and must handle errors using try/catch.
 *
 * IMPORTANT:
 * Code using these methods should handle rejections gracefully.
 * Unhandled rejections in VS Code may result in undesired
 * notifications to the user.
 */
export default class AsyncContext extends Context {

    protected providers: Providers;
    private isReadyPromise: Promise<boolean>;

    constructor(vsContext: ExtensionContext) {
        super(vsContext);
        this.isReadyPromise = new Promise((res, rej) => {
            const asyncOp = async () => {
                try {
                    await this.loadContext();
                } catch (err) {
                    rej(this.parseErr(err, "Error loading context."));
                } finally {
                    res(true);
                }
            };
            asyncOp();
        });

        // Providers must always initialize after the `isReadyPromise`.
        // Otherwise, it will be undefined.
        this.providers = this.buildProviders();
    }

    /**
     * Builds the different providers in the extension.
     *
     * This is the only function that it is not async.
     * The only reason is here is the circular dependency betwee providers and
     * context.
     */
    private buildProviders() {
        const activity = new ActivityLogTreeProvider(this.vsContext);
        const database = new DatabaseTreeProvider(this);
        const auth = new AuthProvider(this.vsContext.extensionUri, this);
        const results = new ResultsProvider(this.vsContext.extensionUri);

        // Register providers
        vscode.window.registerTreeDataProvider('activityLog', activity);
        vscode.window.createTreeView('explorer', { treeDataProvider: database });
        this.vsContext.subscriptions.push(vscode.commands.registerCommand('materialize.refresh', () => {
            database.refresh();
        }));
        this.vsContext.subscriptions.push(
            vscode.window.registerWebviewViewProvider(
                "profile",
                auth
            )
        );
        this.vsContext.subscriptions.push(
            vscode.window.registerWebviewViewProvider(
                "queryResults",
                results,
                { webviewOptions: { retainContextWhenHidden: true } }
            )
        );

        return {
            activity,
            database,
            auth,
            results
        };
    }

    /**
     * Loads the Admin and Cloud clients, and
     * triggers the environment load.
     * @returns
     */
    private async loadContext(init?: boolean) {
        const profile = this.config.getProfile();
        const profileNames = this.config.getProfileNames();
        this.environment = undefined;

        // If there is no profile loaded skip, do not load a context.
        if (!profile) {
            if (profileNames && profileNames.length > 0) {
                this.loaded = true;
                throw new Error(Errors.profileDoesNotExist);
            } else {
                this.loaded = true;
                return true;
            }
        }

        console.log("[AsyncContext]", "Loading context for profile.");
        const adminEndpoint = this.config.getAdminEndpoint();
        const appPassword = await this.config.getAppPassword();
        if (!appPassword) {
            throw new Error(Errors.missingAppPassword);
        }

        const adminClient = new AdminClient(appPassword, adminEndpoint);
        this.clients = {
            ...this.clients,
            admin: adminClient,
            cloud: new CloudClient(adminClient, profile["cloud-endpoint"])
        };

        await this.loadEnvironment(init);
        return true;
    }

    /**
     * Loads all the environment information.
     * @param reloadSchema
     */
    private async loadEnvironment(init?: boolean, reloadSchema?: boolean): Promise<boolean> {
        this.loaded = false;

        if (!init) {
            this.providers.database.refresh();
        }

        const profile = this.config.getProfile();

        if (!this.clients.admin || !this.clients.cloud) {
            throw new Error(Errors.unconfiguredClients);
        } else if (!profile) {
            throw new Error(Errors.unconfiguredProfile);
        } else {
            // Clean the previous [SqlClient] connection.
            if (this.clients.sql) {
                console.log("[AsyncContext]", "Ending SQL client connection.");
                this.clients.sql.end();
            }
            this.clients.sql = new SqlClient(this.clients.admin, this.clients.cloud, profile, this);

            try {
                await this.clients.sql.connectErr();
            } catch (err) {
                console.error("[AsyncContext]", "Sql Client connect err: ", err);
                throw err;
            }

            // Set environment
            if (!this.environment) {
                const environmentPromises = [
                    this.internalQuery("SHOW CLUSTER;"),
                    this.internalQuery("SHOW DATABASE;"),
                    this.internalQuery("SHOW SCHEMA;"),
                    this.internalQuery(`SELECT id, name FROM mz_clusters;`),
                    this.internalQuery(`SELECT id, name FROM mz_databases;`),
                    this.internalQuery(`SELECT id, name, database_id as "databaseId" FROM mz_schemas`),
                ];

                try {
                    const [
                        { rows: [{ cluster }] },
                        { rows: [{ database }] },
                        { rows: [{ schema }] },
                        { rows: clusters },
                        { rows: databases },
                        { rows: schemas },
                    ] = await Promise.all(environmentPromises);

                    const databaseObj = databases.find((x: { name: any; }) => x.name === database);

                    this.environment = {
                        cluster,
                        database,
                        schema,
                        databases,
                        schemas: schemas.filter((x: { databaseId: any; }) => x.databaseId === databaseObj?.id),
                        clusters
                    };

                    const schemaObj = schemas.find((x: { name: string, databaseId: string, }) => x.name === schema && x.databaseId === databaseObj?.id);
                    console.log("[AsyncContext]", schemaObj, schemas);
                    if (schemaObj) {
                        this.explorerSchema = await this.getExplorerSchema(database, schemaObj);
                    }
                    console.log("[AsyncContext]", "Environment:", this.environment);
                } catch (err) {
                    console.error("[AsyncContext]", "Error querying environment information: ", err);
                    throw err;
                }
            } else if (reloadSchema && this.environment) {
                console.log("[AsyncContext]", "Reloading schema.");
                const schemaPromises = [
                    this.internalQuery("SHOW SCHEMA;"),
                    this.internalQuery(`SELECT id, name, database_id as "databaseId" FROM mz_schemas;`)
                ];
                const [
                    { rows: [{ schema }] },
                    { rows: schemas }
                ] = await Promise.all(schemaPromises);

                const { databases, database } = this.environment;
                const databaseObj = databases.find(x => x.name === database);
                this.environment.schema = schema;
                this.environment.schemas = schemas.filter((x: { databaseId: string | undefined; }) => x.databaseId === databaseObj?.id);

                const schemaObj = schemas.find((x: { name: string, databaseId: string, }) => x.name === schema && x.databaseId === databaseObj?.id);
                if (schemaObj) {
                    this.explorerSchema = await this.getExplorerSchema(database, schema);
                }
            }

            if (this.explorerSchema) {
                console.log("[AsyncContext]", "Update schema.");
                try {
                    this.clients.lsp.updateSchema(this.explorerSchema);
                } catch (err) {
                    console.error("[AsyncContext]", "Error updating LSP schema:", err);
                }
            }

            console.log("[AsyncContext]", "Environment loaded.");
            this.loaded = true;
            return true;
        }
    }

    private async getExplorerSchema(
        database: string,
        { name: schema, id: schemaId }: MaterializeObject,
    ) {
        // Not super efficient.
        // TODO: Replace query that appears down.
        const [columnsResults, objects] = await Promise.all([
            this.internalQuery(`
                SELECT * FROM mz_columns;
            `, []),
            this.internalQuery(`
                SELECT id, name, 'source' AS type FROM mz_sources WHERE schema_id = $1
                UNION ALL SELECT id, name, 'sink' AS type FROM mz_sinks WHERE schema_id = $1
                UNION ALL SELECT id, name, 'view' AS type FROM mz_views WHERE schema_id = $1
                UNION ALL
                    SELECT id, name, 'materializedView' AS type FROM mz_materialized_views WHERE schema_id = $1
                UNION ALL SELECT id, name, 'table' AS type FROM mz_tables WHERE schema_id = $1
                ORDER BY name;
            `, [schemaId]),
        ]);

        const columnsMap: { [id: string] : Array<SchemaObjectColumn>; } = {};
        columnsResults.rows.forEach(({ id, name, type }: any) => {
            const columns = columnsMap[id];
            const column = { name, type };
            if (columns) {
                columns.push(column);
            } else {
                columnsMap[id] = [column];
            }
        });

        return {
            database,
            schema,
            objects: objects.rows.filter(x => columnsMap[x.id]).map((x: any) => ({
                name: x.name,
                type: x.type,
                columns: columnsMap[x.id]
            }))
        };
    }

    /**
     * Returns or create the SQL client once is ready.
     *
     * The SQL client abstracts the usage of the pg client.
     * @returns {SqlClient}
     */
    private async getSqlClient(): Promise<SqlClient> {
        if (this.clients.sql) {
            return this.clients.sql;
        } else {
            // Profile needs to be created first.
            return await new Promise((res, rej) => {
                const asyncOp = async () => {
                    try {
                        await this.isReady();
                    } catch (err) {
                        console.error("[AsyncContext]", "Error getting SQL client: ", err);
                    } finally {
                        if (!this.clients.sql) {
                            rej(new Error("Error getting SQL client."));
                        } else {
                            res(this.clients.sql);
                        }
                    }
                };

                asyncOp();
            });
        }
    }

    /**
     * Adds a new profile.
     *
     * Requires to reload the context.
     * @param name new profile name.
     * @param appPassword new app-password.
     * @param region new region name.
     */
    async addAndSaveProfile(name: string, appPassword: AppPassword, region: string) {
        try {
            await this.config.addAndSaveProfile(name, appPassword, region);
            try {
                const success = await this.reloadContext();
                return success;
            } catch (err) {
                throw this.parseErr(err, "Error reloading context.");
            }
        } catch (err) {
            throw this.parseErr(err, "Error saving profile.");
        }
    }

    /**
     * Removes a profile from the configuration
     * and saves the changes.
     * @param name profile name.
     */
    async removeAndSaveProfile(name: string) {
        try {
            this.config.removeAndSaveProfile(name);
            const success = await this.reloadContext();
            return success;
        } catch (err) {
            throw this.parseErr(err, "Error reloading context.");
        }
    }

    /**
     * Sets the current profile in the context.
     *
     * This requires to reload the context.
     * @param name valid profile name.
     */
    async setProfile(name: string) {
        try {
            this.config.setProfile(name);
            this.environment = undefined;
            try {
                const success = await this.reloadContext();
                return success;
            } catch (err) {
                console.error("[AsyncContext]", "Error reloading context: ", err);
                throw this.parseErr(err, "Error reloading context.");
            }
        } catch (err) {
            console.error("[AsyncContext]", "Error setting profile: ", err);
            throw this.parseErr(err, "Error setting profile.");
        }
    }

    /**
     * Handle any error and display the error in the profile/auth component.
     * @param err
     * @param altMessage
     */
    private parseErr(err: unknown, altMessage: string): Error {
        console.log("[AsyncContext]", altMessage);

        if (err instanceof ExtensionError || err instanceof Error) {
            return new Error(err.message);
          } else {
            return new Error(altMessage || Errors.unexpectedErrorContext);
          }
    }

    /**
     * Reloads the whole context.
     */
    private async reloadContext() {
        this.isReadyPromise = new Promise((res, rej) => {
            const asyncOp = async () => {
                try {
                    const success = await this.loadContext();
                    res(success);
                } catch (err) {
                    rej(this.parseErr(err, "Error reloading context."));
                }
            };

            asyncOp();
        });

        return this.isReadyPromise;
    }

    /**
     * Reloads the environment with another configuration.
     * @param reloadSchema only true when the database changes.
     */
    private async reloadEnvironment(reloadSchema?: boolean) {
        this.isReadyPromise = new Promise((res, rej) => {
            const asyncOp = async () => {
                try {
                    await this.loadEnvironment(false, reloadSchema);
                    res(true);
                } catch (err) {
                    rej(this.parseErr(err, "Error reloading environment."));
                }
            };

            asyncOp();
        });

        return this.isReadyPromise;
    }

    /**
     * Internal queries are intended for exploring cases.
     * Like quering the catalog, or information about Materialize.
     * Queries goes to the pool, and no client is kept.
     *
     * @param text
     * @param vals
     * @returns query results
     */
    async internalQuery(text: string, vals?: Array<any>): Promise<QueryResult<any>> {
        const client = await this.getSqlClient();

        return await client.internalQuery(text, vals);
    }

    /**
     * Private queries are intended for the user.
     * A private query reuses always the same client.
     * In this way, it functions like a shell,
     * processing one statement after another.
     *
     * Another important difference is that
     * it returns the values in Array mode.
     *
     * @param text
     * @param vals
     * @returns query results
     */
    async privateQuery(text: string, vals?: Array<any>): Promise<QueryArrayResult<any>> {
        const client = await this.getSqlClient();
        return await client.privateQuery(text, vals);
    }

    /**
     * Sends a request to the LSP server to execute the parse command.
     * The parse command returns the list of statements in an array,
     * including their corresponding SQL and type (e.g., select, create_table, etc.).
     *
     * @param sql
     * @returns {Promise<Array<ExecuteCommandParseStatement>>}
     */
    async parseSql(sql: string): Promise<Array<ExecuteCommandParseStatement>> {
        return this.clients.lsp.parseSql(sql, true);
    }

    /**
     * Use this method to verify if the context is ready to receive requests.
     *
     * Return does not means it is healthy.
     * @returns {Promise<boolean>}
     */
    async isReady() {
        try {
            await this.isReadyPromise;
            return true;
        } catch (err) {
            throw this.parseErr(err, "Error waiting to be ready.");
        }
    }

    /**
     * Sets a new database.
     * Requires and environment and schema reload.
     * @param name valid database name.
     */
    async setDatabase(name: string) {
        // Every database has different schemas.
        // Setting an undefined schema before loading the env.
        // Triggers a new search for a valid schema.
        if (this.environment) {
            // Reload schema after loading the environment.
            this.environment = {
                ...this.environment,
                database: name,
                schema: "",
                schemas: [],
            };
        }

        try {
            const success = await this.reloadEnvironment(true);
            return success;
        } catch (err) {
            throw this.parseErr(err as Error, "Error reloading environment.");
        }
    }

    /**
     * Sets a new cluster.
     * Requires an environment reload.
     * @param name valid cluster name.
     */
    async setCluster(name: string) {
        if (this.environment) {
            this.environment = {
                ...this.environment,
                cluster: name,
            };
        }

        try {
            const success = await this.reloadEnvironment();
            return success;
        } catch (err) {
            throw this.parseErr(err as Error, "Error reloading environment.");
        }
    }

    /**
     * Sets a new schema.
     * Requires an environment reload.
     * @param name valid schema name.
     */
    async setSchema(name: string) {
        if (this.environment) {
            this.environment = {
                ...this.environment,
                schema: name,
            };
        }

        try {
            const success = await this.reloadEnvironment();
            return success;
        } catch (err) {
            throw this.parseErr(err as Error, "Error reloading environment.");
        }
    }

    /**
     * @returns the current user app-password.
     */
    async getAppPassword() {
        try {
            const appPassword = await this.config.getAppPassword();
            return appPassword;
        } catch (err) {
            throw this.parseErr(err, "Error getting app-password.");
        }
    }

    /**
     * @returns the available providers.
     */
    getProviders(): Providers {
        return this.providers;
    }

    /**
     * Stops the LSP client.
     *
     * Note: This action should be executed only when deactivating the extension.
     */
    async stop() {
        await this.clients.lsp.stop();
    }
}