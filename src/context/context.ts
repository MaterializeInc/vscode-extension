import EventEmitter = require("node:events");
import { AdminClient, CloudClient, SqlClient } from "../clients";
import { Config } from "./config";
import { MaterializeObject, MaterializeSchemaObject } from "../providers/schema";
import AppPassword from "./appPassword";
import LspClient, { ExecuteCommandParseStatement } from "../clients/lsp";
import { Errors, ExtensionError } from "../utilities/error";
import { PoolClient } from "pg";

export enum EventType {
    newProfiles,
    newQuery,
    sqlClientConnected,
    queryResults,
    environmentLoaded,
    environmentChange,
    error
}

interface Environment {
    clusters: Array<MaterializeObject>;
    schemas: Array<MaterializeSchemaObject>;
    databases: Array<MaterializeObject>;
    schema: string;
    database: string;
    cluster: string;
}

export class Context extends EventEmitter {
    private config: Config;
    private loaded: boolean;

    private adminClient?: AdminClient;
    private cloudClient?: CloudClient;
    private sqlClient?: SqlClient;
    private lspClient: LspClient;

    private environment?: Environment;

    constructor() {
        super();
        this.config = new Config();
        this.loaded = false;
        this.lspClient = new LspClient();
        this.loadContext();
    }

    private async loadContext() {
        const profile = this.config.getProfile();
        this.environment = undefined;

        // If there is no profile loaded skip, do not load a context.
        if (!profile) {
            this.loaded = true;
            return;
        }

        console.log("[Context]", "Loading context for profile.");
        try {
            const adminEndpoint = this.config.getAdminEndpoint();
            const appPassword = await this.config.getAppPassword();
            if (!appPassword) {
                console.error("[Context]", "Missing app-password.");
                this.emit("event", { type: EventType.error, message: Errors.missingAppPassword });
                return;
            }

            this.adminClient = new AdminClient(appPassword, adminEndpoint);
            this.cloudClient = new CloudClient(this.adminClient, profile["cloud-endpoint"]);
            this.loadEnvironment();
        } catch (err) {
            console.error("[Context]", err);
            this.emit("event", { type: EventType.error, message: Errors.unexpectedErrorContext });
        }
    }

    /**
     * @returns the current user app-password.
     */
    async getAppPassword() {
        return this.config.getAppPassword();
    }

    private async loadEnvironment(reloadSchema?: boolean) {
        this.loaded = false;
        this.emit("event", { type: EventType.environmentChange });

        const profile = this.config.getProfile();

        if (!this.adminClient || !this.cloudClient) {
            throw new Error(Errors.unconfiguredClients);
        } else if (!profile) {
            throw new Error(Errors.unconfiguredProfile);
        } else {
            this.sqlClient = new SqlClient(this.adminClient, this.cloudClient, profile, this);
            this.sqlClient.connectErr().catch((err) => {
                console.error("[Context]", "Sql Client connect err: ", err);
                this.emit("event", { type: EventType.error, message: Errors.unexpectedSqlClientConnectionError });
            });

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

                    console.log("[Context]", "Environment:", this.environment);
                } catch (err) {
                    // TODO: Display error.
                    console.error("[Context]", "Error loading environment: ", err);
                }
            }

            if (reloadSchema && this.environment) {
                // TODO: Improve this code.
                console.log("[Context]", "Reloading schema.");
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

            console.log("[Context]", "Environment loaded.");
            this.loaded = true;
            this.emit("event", { type: EventType.environmentLoaded });
        }
    }

    isLoading(): boolean {
        return !this.loaded;
    }

    async waitReadyness(): Promise<boolean> {
        return await new Promise((res, rej) => {
            if (this.loaded === true) {
                res(true);
            } else {
                this.on("event", ({ type }) => {
                    if (type === EventType.environmentLoaded) {
                        if (!this.environment) {
                            rej(new Error("Error getting environment."));
                        } else {
                            res(true);
                        }
                    }
                });
            }
        });
    }

    private async getSqlClient(): Promise<SqlClient> {
        if (this.sqlClient) {
            return this.sqlClient;
        } else {
            // Profile needs to be created first.
            return await new Promise((res, rej) => {
                this.on("event", ({ type }) => {
                    if (type === EventType.sqlClientConnected) {
                        if (!this.sqlClient) {
                            rej(new Error("Error getting SQL client."));
                        } else {
                            res(this.sqlClient);
                        }
                    }
                });
            });
        }
    }

    stop() {
        this.lspClient.stop();
    }

    async query(text: string, vals?: Array<any>) {
        const client = await this.getSqlClient();

        return await client.query(text, vals);
    }

    /**
     * This method is NOT recommended to use.
     * Make sure to understand clients from the pool lifecycle.
     * @returns a client from the pool.
     */
    async poolClient(): Promise<PoolClient> {
        const client = await this.getSqlClient();
        return await client.poolClient();
    }

    getClusters(): MaterializeObject[] | undefined {
        return this.environment?.clusters;
    }

    getCluster(): string | undefined {
        return this.environment?.cluster;
    }

    getDatabases(): MaterializeObject[] | undefined {
        return this.environment?.databases;
    }

    getDatabase(): string | undefined {
        return this.environment?.database;
    }

    getSchemas(): MaterializeSchemaObject[] | undefined {
        return this.environment?.schemas;
    }

    getSchema(): string | undefined {
        return this.environment?.schema;
    }

    getProfileNames() {
        return this.config.getProfileNames();
    }

    getProfileName() {
        return this.config.getProfileName();
    }

    async addAndSaveProfile(name: string, appPassword: AppPassword, region: string) {
        await this.config.addAndSaveProfile(name, appPassword, region);
        await this.loadContext();
    }

    async removeAndSaveProfile(name: string) {
        this.config.removeAndSaveProfile(name);
        await this.loadContext();
    }

    async setProfile(name: string) {
        this.config.setProfile(name);
        this.environment = undefined;
        await this.loadContext();
    }

    async parseSql(sql: string): Promise<Array<ExecuteCommandParseStatement>> {
        return this.lspClient.parseSql(sql);
    }

    handleErr(err: Error) {
        if (err instanceof ExtensionError) {
            this.emit("event", { type: EventType.error, message: err.message });
          } else {
            this.emit("event", { type: EventType.error, message: Errors.unexpectedErrorContext });
          }
    }

    setDatabase(name: string) {
        // Every database has different schemas.
        // Setting an undefined schema before loading the env.
        // Triggers a new search for a valid schema.
        if (this.environment) {
            // Reload schema after loading the environment.
            this.environment = {
                ...this.environment,
                database: name,
                schema: "",
            };
        }

        try {
            this.loadEnvironment(true);
        } catch (err) {
            this.handleErr(err as Error);
        }
    }

    setCluster(name: string) {
        if (this.environment) {
            this.environment = {
                ...this.environment,
                cluster: name,
            };
        }

        try {
            this.loadEnvironment();
        } catch (err) {
            this.handleErr(err as Error);
        }
    }

    setSchema(name: string) {
        if (this.environment) {
            this.environment = {
                ...this.environment,
                schema: name,
            };
        }

        try {
            this.loadEnvironment();
        } catch (err) {
            this.handleErr(err as Error);
        }
    }

    getEnvironment() {
        return this.environment;
    }
}

export default Context;