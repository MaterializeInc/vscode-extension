/* eslint-disable @typescript-eslint/naming-convention */
import * as TOML from "@iarna/toml";
import * as os from "os";
import { accessSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import EventEmitter = require("node:events");
import AdminClient from "./clients/admin";
import CloudClient from "./clients/cloud";
import AppPassword from "./AppPassword";
import { MaterializeObject, MaterializeSchemaObject } from "../providers/schema";
import SqlClient from "./clients/sql";

export interface Profile {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "app-password": string,
    region: string,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "admin-endpoint"?: string,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "cloud-endpoint"?: string,
}

export interface Config {
    profile?: string;
    profiles?: { [name: string] : Profile; }
}

export enum EventType {
    newProfiles,
    newQuery,
    profileChange,
    connected,
    queryResults,
    newClusters,
    newDatabases,
    newSchemas,
    environmentLoaded,
    environmentChange,
}

interface Event {
    type: EventType;
    data?: any;
}

interface Environment {
    current: {
        cluster?: String | undefined,
        schema?: String | undefined,
        database?: String | undefined
    },
    clusters: Array<MaterializeObject>,
    schemas: Array<MaterializeSchemaObject>,
    databases: Array<MaterializeObject>
}

export declare interface Context {
    on(event: "event", listener: (e: Event) => void): this;
}

// TODO: Separate context in two context. One with profile available, another without it.
export class EnvironmentContext extends EventEmitter {
    adminClient!: AdminClient;
    cloudClient!: CloudClient;
    sqlClient!: SqlClient;
    environment: Environment;
    environmentLoaded: boolean;

    constructor(
        adminClient: AdminClient,
        cloudClient: CloudClient,
        sqlClient: SqlClient,
    ) {
        super();
        this.environment = {
            current: {},
            clusters: [],
            databases: [],
            schemas: []
        };
        this.adminClient = adminClient;
        this.cloudClient = cloudClient;
        this.sqlClient = sqlClient;
        this.environmentLoaded = false;

        this.loadEnvironment();
    }

    private async loadEnvironment () {
        // TODO: Improve this part with and remove find(...); from the methods at the end.
        const databasesPromise = this.loadDatabases();
        const clustersPromise = this.loadClusters();
        const schemasPromise = this.loadSchemas();

        Promise.all([clustersPromise, schemasPromise, databasesPromise]).then(() => {
            console.log("[Context]", "Environment loaded.");
            this.environmentLoaded = true;
            this.emit("event", { type: EventType.environmentLoaded });
        }).catch((err) => {
            console.error("[Context]", "Error loading environment: ", err);
        });
    }

    private async loadDatabases () {
        let promises = [];

        promises.push(
            this.sqlClient?.query("SELECT id, name, owner_id FROM mz_databases;").then(({ rows }) => {
                console.log("[Context]", "Setting databases.");
                this.environment.databases = rows.map(x => ({
                    id: x.id,
                    name: x.name,
                    ownerId: x.owner_id,
                }));
            }).catch((err) => {
                console.error("[Context]", "Error loading databases: ", err);
            })
        );

        if (!this.environment.current.database) {
            promises.push(
                this.sqlClient?.query("SHOW DATABASE;").then(({ rows }) => {
                    if (rows.length > 0) {
                        console.log("[Context]", "Setting database: ", rows[0].database);
                        this.environment.current.database = rows[0].database;
                    }
                }).catch((err) => {
                    console.error("[Context]", "Error loading database: ", err);
                })
            );
        }

        await Promise.all(promises);
        this.emit("event", { type: EventType.newDatabases });
    }

    private async loadSchemas() {
        const promises = [];
        promises.push(this.sqlClient?.query("SELECT id, name, database_id, owner_id FROM mz_schemas;").then(({ rows }) => {
            console.log("[Context]", "Setting schemas.");
            this.environment.schemas = rows.map(x => ({
                id: x.id,
                name: x.name,
                ownerId: x.owner_id,
                databaseId: x.database_id,
            }));
        }).catch((err) => {
            console.error("[Context]", "Error loading schemas: ", err);
        }));

        if (!this.environment.current.schema) {
            promises.push(this.sqlClient?.query("SHOW SCHEMA;").then(({ rows }) => {
                if (rows.length > 0) {
                    console.log("[Context]", "Setting schema: ", rows[0].schema);
                    this.environment.current.schema = rows[0].schema;
                }
            }).catch((err) => {
                console.error("[Context]", "Error loading schema: ", err);
            }));
        }

        await Promise.all(promises);
        this.emit("event", { type: EventType.newSchemas });
    }

    private async loadClusters() {
        const promises = [];
        promises.push(this.sqlClient?.query("SELECT id, name, owner_id FROM mz_clusters;").then(({ rows }) => {
            console.log("[Context]", "Setting clusters.");
            this.environment.clusters = rows.map(x => ({
                id: x.id,
                name: x.name,
                ownerId: x.owner_id,
            }));
        }).catch((err) => {
            console.error("[Context]", "Error loading clusters: ", err);
        }));

        if (!this.environment.current.cluster) {
            promises.push(this.sqlClient?.query("SHOW CLUSTER;").then(({ rows }) => {
                if (rows.length > 0) {
                    console.log("[Context]", "Setting cluster: ", rows[0].cluster);
                    this.environment.current.cluster = rows[0].cluster;
                }
            }).catch((err) => {
                console.error("[Context]", "Error loading cluster: ", err);
            }));
        }

        await Promise.all(promises);
        this.emit("event", { type: EventType.newClusters });
    }

    getCluster(): String | undefined {
        return this.environment.current.cluster;
    }

    getClusters(): MaterializeObject[] {
        return this.environment.clusters;
    }

    getDatabases(): MaterializeObject[] {
        return this.environment.databases;
    }

    getDatabase(): MaterializeObject | undefined {
        // TODO: Make this simpler after loading env correctly.
        return this.environment.databases.find(x => x.name === this.environment.current.database);
    }

    getSchemas(): MaterializeSchemaObject[] {
        // TODO: Make this simpler after loading env correctly.
        return this.environment.schemas.filter(x => x.databaseId === this.getDatabase()?.id);
    }

    getSchema(): MaterializeSchemaObject | undefined {
        // TODO: Make this simpler after loading env correctly.
        return this.environment.schemas.find(x => x.databaseId === this.getDatabase()?.id && x.name === this.environment.current.schema);
    }

    getSchemaId(): String | undefined {
        // TODO: Make this simpler after loading env correctly.
        const schema = this.environment.schemas.find(x => x.name === this.environment.current.schema && x.name === this.environment.current.schema);
        return schema?.id;
    }

    setDatabase(name: String) {
        this.environment.current.database = name;
        this.emit("event", { type: EventType.environmentChange });
        // this.loadSqlClient();
    }

    setSchema(name: String) {
        this.environment.current.schema = name;
        this.emit("event", { type: EventType.environmentChange });
        // this.loadSqlClient();
    }

    setCluster(name: String) {
        this.environment.current.cluster = name;
        this.emit("event", { type: EventType.environmentChange });
        // this.loadSqlClient();
    }
}

export default Context;