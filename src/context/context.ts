/* eslint-disable @typescript-eslint/naming-convention */
import EventEmitter = require("node:events");
import { AdminClient, CloudClient, SqlClient } from "../clients";
import { Config } from "./config";
import { MaterializeObject, MaterializeSchemaObject } from "../providers/schema";
import AppPassword from "./appPassword";

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
    private config: Config;
    private loaded: boolean;

    private adminClient?: AdminClient;
    private cloudClient?: CloudClient;
    private sqlClient?: SqlClient;

    private environment?: Environment;

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
            this.loadEnvironment();
            return true;
        }

        return false;
    }

    private async loadEnvironment() {
        this.loaded = false;
        this.emit("event", { type: EventType.environmentChange });

        const profile = this.config.getProfile();

        if (!this.adminClient || !this.cloudClient || !profile) {
            throw new Error("Missing clients.");
        } else {
            this.sqlClient = new SqlClient(this.adminClient, this.cloudClient, profile);

            // TODO: Do in parallel.
            if (!this.config.getCluster()) {
                console.log("[Context]", "Setting cluster.");
                this.config.setCluster((await this.query("SHOW CLUSTER;")).rows[0].cluster);
            }

            if (!this.config.getDatabase()) {
                console.log("[Context]", "Setting database.");
                this.config.setDatabase((await this.query("SHOW DATABASE;")).rows[0].database);
            }

            if (!this.config.getSchema()) {
                console.log("[Context]", "Setting schema.");
                this.config.setSchema((await this.query("SHOW SCHEMA;")).rows[0].schema);
            }

            const clustersPromise = this.sqlClient.getClusters();
            const databases = await this.sqlClient.getDatabases();
            const database = databases.find(x => x.name === this.config.getDatabase());

            console.log("[Context]", "Databases: ", databases, " - Database: " , this.config.getDatabase());
            if (!database) {
                // Display error to user.
                throw new Error("Error finding database.");
            }

            const schemasPromise = this.sqlClient.getSchemas(database);

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

                this.environment = {
                    cluster,
                    schema,
                    clusters,
                    database,
                    databases,
                    schemas
                };
                console.log("[Context]", "Environment loaded.");
                this.loaded = true;
                this.emit("event", { type: EventType.environmentLoaded });
            }).catch((err) => {
                console.error("[Context]", "Error loading environment: ", err);
            });
        }
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

    async query(text: string, vals?: Array<any>) {
        const client = await this.getSqlClient();

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

    getProfileNames() {
        return this.config.getProfileNames();
    }

    getProfileName() {
        return this.config.getProfileName();
    }

    addProfile(name: string, appPassword: AppPassword, region: string) {
        this.config.addProfile(name, appPassword, region);
        this.loadContext();
    }

    setProfile(name: string) {
        this.config.setProfile(name);
        this.loadContext();
    }

    setDatabase(name: string) {
        this.config.setDatabase(name);
        this.loadEnvironment();
    }

    setCluster(name: string) {
        this.config.setCluster(name);
        this.loadEnvironment();
    }

    setSchema(name: string) {
        this.config.setSchema(name);
        this.loadEnvironment();
    }
}

export default Context;