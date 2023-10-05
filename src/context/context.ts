/* eslint-disable @typescript-eslint/naming-convention */
import EventEmitter = require("node:events");
import { AdminClient, CloudClient, SqlClient } from "../clients";
import { Config, NonStorableConfigProfile } from "./config";
import { MaterializeObject, MaterializeSchemaObject } from "../providers/schema";
import AppPassword from "./appPassword";
import { Errors } from "../utilities/error";

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
            console.log("[Context]", "Loading context for profile.");

            this.adminClient = new AdminClient(profile["app-password"], this.getAdminEndpoint(profile));
            this.cloudClient = new CloudClient(this.adminClient, profile["cloud-endpoint"]);
            this.loadEnvironment();

            return true;
        }

        return false;
    }

    private getAdminEndpoint(profile: NonStorableConfigProfile): string | undefined {
        if (profile["admin-endpoint"]) {
            return profile["admin-endpoint"];
        } else if (profile["cloud-endpoint"]) {
            const cloudUrl = new URL(profile["cloud-endpoint"]);
            const { hostname } = cloudUrl;
            if (hostname.startsWith("api.")) {
                cloudUrl.hostname = "admin." + hostname.slice(4);
                return cloudUrl.toString();
            } else {
                console.error("The admin endpoint is invalid.");
                return undefined;
            }
        }

        return undefined;
    }

    private async loadEnvironment() {
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
                this.emit("event", { type: EventType.error, data: { message: err.message } });
            });

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
                throw new Error(Errors.databaseIsNotAvailable);
            }

            const schemasPromise = this.sqlClient.getSchemas(database);

            Promise.all([clustersPromise, schemasPromise]).then(([clusters, schemas]) => {
                const cluster = clusters.find(x => x.name === this.config.getCluster());
                const schema = schemas.find(x => x.name === this.config.getSchema());

                if (!cluster) {
                    // Display error to user.
                    throw new Error(Errors.clusterIsNotAvailable);
                }

                if (!schema) {
                    // Display error to user.
                    throw new Error(Errors.schemaIsNotAvailable);
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

    addAndSaveProfile(name: string, appPassword: AppPassword, region: string) {
        this.config.addAndSaveProfile(name, appPassword, region);
        this.loadContext();
    }

    removeAndSaveProfile(name: string) {
        this.config.removeAndSaveProfile(name);
        this.loadContext();
    }

    setProfile(name: string) {
        this.config.setProfile(name);
        this.loadContext();
    }

    setDatabase(name: string) {
        this.config.setDatabase(name);

        // Every database has different schemas.
        // Setting an undefined schema before loading the env.
        // Triggers a new search for a valid schema.
        this.config.setSchema(undefined);
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