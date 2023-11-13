import { AdminClient, CloudClient, SqlClient } from "../clients";
import { ExtensionContext } from "vscode";
import { Context } from "./context";
import { Errors, ExtensionError } from "../utilities/error";
import AppPassword from "./appPassword";
import { ActivityLogTreeProvider, AuthProvider, DatabaseTreeProvider, ResultsProvider } from "../providers";
import * as vscode from 'vscode';
import { QueryResult } from "pg";

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
 * Public methods should never reject a Promise (`rej(..)`)
 * or throw errors (`throw new Error()`).
 *
 * Unhandled rejections in VS Code may result in undesired
 * notifications to the user.
 */
export default class AsyncContext extends Context {

    protected providers: Providers;
    private isReadyPromise: Promise<boolean>;

    constructor(vsContext: ExtensionContext) {
        super(vsContext);
        this.isReadyPromise = new Promise((res) => {
            const asyncOp = async () => {
                try {
                    await this.loadContext();
                } catch (err) {
                    this.handleErr(err, "Error loading context.");
                    res(false);
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
        this.environment = undefined;

        // If there is no profile loaded skip, do not load a context.
        if (!profile) {
            this.loaded = true;
            throw new Error(Errors.profileDoesNotExist);
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
                    this.query("SHOW CLUSTER;"),
                    this.query("SHOW DATABASE;"),
                    this.query("SHOW SCHEMA;"),
                    this.query(`SELECT id, name, owner_id as "ownerId" FROM mz_clusters;`),
                    this.query(`SELECT id, name, owner_id as "ownerId" FROM mz_databases;`),
                    this.query(`SELECT id, name, database_id as "databaseId", owner_id as "ownerId" FROM mz_schemas`),
                ];

                try {
                    const [
                        { rows: [{ cluster }] },
                        { rows: [{ database }] },
                        { rows: [{ schema }] },
                        { rows: clusters },
                        { rows: databases },
                        { rows: schemas }
                    ] = await Promise.all(environmentPromises);

                    const databaseObj = databases.find(x => x.name === database);

                    this.environment = {
                        cluster,
                        database,
                        schema,
                        databases,
                        schemas: schemas.filter(x => x.databaseId === databaseObj?.id),
                        clusters
                    };

                    console.log("[AsyncContext]", "Environment:", this.environment);
                } catch (err) {
                    console.error("[AsyncContext]", "Error querying evnrionment information.");
                    throw err;
                }
            }

            if (reloadSchema && this.environment) {
                console.log("[AsyncContext]", "Reloading schema.");
                const schemaPromises = [
                    this.query("SHOW SCHEMA;"),
                    this.query(`SELECT id, name, database_id as "databaseId", owner_id as "ownerId" FROM mz_schemas`)
                ];
                const [
                    { rows: [{ schema }] },
                    { rows: schemas }
                ] = await Promise.all(schemaPromises);

                const { databases, database } = this.environment;
                const databaseObj = databases.find(x => x.name === database);
                this.environment.schema = schema;
                this.environment.schemas = schemas.filter(x => x.databaseId === databaseObj?.id);
            }
            console.log("[AsyncContext]", "Environment loaded.");
            this.loaded = true;
            return true;
        }
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
                        await this.isReady;
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
                this.handleErr(err, "Error reloading context.");
            }
            return true;
        } catch (err) {
            this.handleErr(err, "Error saving profile.");

            return false;
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
            this.handleErr(err, "Error reloading context.");
            return false;
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
                this.handleErr(err, "Error reloading context.");
                console.error("[AsyncContext]", "Error reloading context: ", err);
            }
        } catch (err) {
            this.handleErr(err, "Error setting profile.");
            console.error("[AsyncContext]", "Error setting profile: ", err);
        }

        return false;
    }

    /**
     * Handle any error and display the error in the profile/auth component.
     * @param err
     * @param altMessage
     */
    private handleErr(err: unknown, altMessage: string) {
        console.log("[AsyncContext]", altMessage);

        if (err instanceof ExtensionError || err instanceof Error) {
            this.providers.auth.displayError(err.message);
          } else {
            this.providers.auth.displayError(altMessage || Errors.unexpectedErrorContext);
          }
    }

    /**
     * Reloads the whole context.
     */
    private async reloadContext() {
        this.isReadyPromise = new Promise((res) => {
            const asyncOp = async () => {
                try {
                    const success = await this.loadContext();
                    res(success);
                } catch (err) {
                    this.handleErr(err, "Error reloading context.");
                    res(false);
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
        this.isReadyPromise = new Promise((res) => {
            const asyncOp = async () => {
                try {
                    await this.loadEnvironment(false, reloadSchema);
                    res(true);
                } catch (err) {
                    this.handleErr(err, "Error reloading environment.");
                    res(false);
                }
            };

            asyncOp();
        });

        return this.isReadyPromise;
    }

    /**
     * Runs a query in the SQL client.
     *
     * WARNING: If using this method handle exceptions carefuly.
     * @param text
     * @param vals
     * @returns
     */
    async query(text: string, vals?: Array<any>): Promise<QueryResult<any>> {
        const client = await this.getSqlClient();
        return await client.query(text, vals);
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
            this.handleErr(err, "Error waiting to be ready.");
            return false;
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
            this.handleErr(err as Error, "Error reloading environment.");
            return false;
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
            this.handleErr(err as Error, "Error reloading environment.");
            return false;
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
            this.handleErr(err as Error, "Error reloading environment.");
            return false;
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
            this.handleErr(err, "Error getting app-password.");
            return undefined;
        }
    }

    /**
     * @returns the available providers.
     */
    getProviders(): Providers {
        return this.providers;
    }
}