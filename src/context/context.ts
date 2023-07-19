/* eslint-disable @typescript-eslint/naming-convention */
import EventEmitter = require("node:events");
import { AdminClient, CloudClient, SqlClient } from "../clients";
import { Config } from "./config";
import { MaterializeObject, MaterializeSchemaObject } from "../providers/schema";

export enum EventType {
    newProfiles,
    newQuery,
    profileChange,
    sqlClientConnected,
    queryResults,
    newClusters,
    newDatabases,
    newSchemas,
    environmentLoaded,
    environmentChange,
}

interface Environment {
    clusters: Array<MaterializeObject>;
    schemas: Array<MaterializeSchemaObject>;
    databases: Array<MaterializeObject>;
    schema: MaterializeSchemaObject;
    database: MaterializeObject;
    cluster: MaterializeObject;
}

export class Context extends EventEmitter {
    config: Config;
    private loaded: boolean;

    adminClient?: AdminClient;
    cloudClient?: CloudClient;
    sqlClient?: SqlClient;

    environment?: Environment;

    constructor() {
        super();
        this.config = new Config();
        this.loaded = false;
        this.loadContext();
    }

    private loadContext() {
        const profile = this.config.getProfile();

        if (profile) {
            this.adminClient = new AdminClient(profile["app-password"]);
            this.cloudClient = new CloudClient(this.adminClient);
            this.sqlClient = new SqlClient(this.adminClient, this.cloudClient, profile);
            this.loadEnvironment(this.sqlClient);
            return true;
        }

        return false;
    }

    private async loadEnvironment(sqlClient: SqlClient) {

        // TODO: Do in parallel.
        if (!this.config.getCluster()) {
            this.config.setCluster((await this.query("SHOW CLUSTER;")).rows[0].name);
        }

        if (!this.config.getDatabase()) {
            this.config.setDatabase((await this.query("SHOW DATABASE;")).rows[0].name);
        }

        if (!this.config.getSchema()) {
            this.config.setSchema((await this.query("SHOW schema;")).rows[0].name);
        }

        const clustersPromise = sqlClient.getClusters();
        const databases = await sqlClient.getDatabases();
        const database = databases.find(x => x.name === this.config.getDatabase());

        if (!database) {
            // Display error to user.
            throw new Error("Error finding database.");
        }

        const schemasPromise = sqlClient.getSchemas(database);

        Promise.all([clustersPromise, schemasPromise]).then(([clusters, schemas]) => {
            const cluster = clusters.find(x => x.name === this.config.getCluster());
            const schema = schemas.find(x => x.name === this.config.getSchema());

            if (!cluster) {
                // Display error to user.
                throw new Error("Error finding cluster.");
            }

            if (!schema) {
                // Display error to user.
                throw new Error("Error finding schema.");
            }

            const newEnvironment: Environment = {
                cluster,
                schema,
                clusters,
                database,
                databases,
                schemas
            };
            console.log("[Environment]", "Environment loaded.");
            this.loaded = true;
            this.emit("event", { type: EventType.environmentLoaded });
        }).catch((err) => {
            console.error("[Environment]", "Error loading environment: ", err);
        });
    }

    async isReady(): Promise<boolean> {
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

    async query(text: string, vals?: Array<any>) {
        const client = await this.getSqlClient();
        await client.connected();

        return await client.query(text, vals);
    }

    getClusters(): MaterializeObject[] | undefined {
        return this.environment?.clusters;
    }

    getCluster(): MaterializeObject | undefined {
        return this.environment?.cluster;
    }

    getDatabases(): MaterializeObject[] | undefined {
        return this.environment?.databases;
    }

    getDatabase(): MaterializeObject | undefined {
        return this.environment?.database;
    }

    getSchemas(): MaterializeSchemaObject[] | undefined {
        return this.environment?.schemas;
    }

    getSchema(): MaterializeSchemaObject | undefined {
        return this.environment?.schema;
    }
}

export default Context;