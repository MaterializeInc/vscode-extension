/* eslint-disable @typescript-eslint/naming-convention */
import * as TOML from "@iarna/toml";
import * as os from "os";
import { accessSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import EventEmitter = require("node:events");
import AdminClient from "./adminClient";
import CloudClient from "./cloudClient";
import { Pool } from "pg";
import AppPassword from "./AppPassword";
import { MaterializeObject, MaterializeSchemaObject } from "../providers/databaseTreeProvider";

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
    profileChange,
    connected,
    queryResults,
    newClusters,
    newDatabases,
    newSchemas,
    environmentLoaded
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

export class Context extends EventEmitter {
    private homeDir = os.homedir();
    private configDir = `${this.homeDir}/.config/materialize`;
    private configName = "mz.toml";
    private configFilePath = `${this.configDir}/${this.configName}`;

    config: Config;
    adminClient?: AdminClient;
    cloudClient?: CloudClient;
    pool?: Promise<Pool>;
    environment: Environment;

    constructor() {
        super();
        this.environment = {
            current: {},
            clusters: [],
            databases: [],
            schemas: []
        };
        this.config = this.loadConfig();
        this.reload();
    }

    private reload() {
        const profile = this.getProfile();

        if (profile) {
            console.log("[Context]", "Loading profile: ", profile);

            this.loadClients(profile);
            this.loadPool(profile);
        }
    }

    private loadClients(profile: Profile) {
        console.log("[Context]", "Loading clients.");

        this.adminClient = new AdminClient(profile["app-password"]);
        this.cloudClient = new CloudClient(this.adminClient);
    }

    private loadPool(profile: Profile) {
        console.log("[Context]", "Loading pool.");

        this.pool = new Promise((res, rej) => {
            console.log("[Context]", "Loading host.");
            this.getHost(profile.region).then((host) => {
                console.log("[Context]", "Loading user email.");
                this.getEmail().then((email) => {
                    const pool = new Pool({
                        host: host && host.substring(0, host.length - 5),
                        // eslint-disable-next-line @typescript-eslint/naming-convention
                        application_name: "mz_vscode",
                        database: "materialize",
                        port: 6875,
                        user: email,
                        password: profile["app-password"],
                        ssl: true,
                    });

                    console.log("[Context]", "Connecting pool.");
                    pool.connect().then(() => {
                        console.log("[Context]", "Pool successfully connected.");
                        res(pool);
                        this.emit("event", { type: EventType.connected });
                        this.loadEnvironment();
                    }).catch((err) => {
                        console.error(err);
                        rej(err);
                    });
                });
            });
        });
    }

    private async loadEnvironment () {
        // TODO: Improve this part with and remove find(...); from the methods at the end.
        const databasesPromise = this.loadDatabases();
        const clustersPromise = this.loadClusters();
        const schemasPromise = this.loadSchemas();

        Promise.all([clustersPromise, schemasPromise, databasesPromise]).then(() => {
            console.log("[Context]", "Environment loaded.");
            this.emit("event", { type: EventType.environmentLoaded });
        }).catch((err) => {
            console.error("[Context]", "Error loading environment: ", err);
        });
    }

    private async loadDatabases () {
        const pool = await this.pool;

        if (pool) {
            const databasesPromise = pool.query("SELECT id, name, owner_id FROM mz_databases;").then(({ rows }) => {
                console.log("[Context]", "Setting databases.");
                this.environment.databases = rows.map(x => ({
                    id: x.id,
                    name: x.name,
                    ownerId: x.owner_id,
                }));
            }).catch((err) => {
                console.error("[Context]", "Error loading databases: ", err);
            });

            const databasePromise = pool.query("SHOW DATABASE;").then(({ rows }) => {
                if (rows.length > 0) {
                    this.environment.current.database = rows[0].database;
                }
            }).catch((err) => {
                console.error("[Context]", "Error loading database: ", err);
            });

            await Promise.all([databasesPromise, databasePromise]);
            this.emit("event", { type: EventType.newDatabases });
        }
    }

    private async loadSchemas() {
        const pool = await this.pool;

        if (pool) {
            const schemasPromise = pool.query("SELECT id, name, database_id, owner_id FROM mz_schemas;").then(({ rows }) => {
                console.log("[Context]", "Setting schemas.");
                this.environment.schemas = rows.map(x => ({
                    id: x.id,
                    name: x.name,
                    ownerId: x.owner_id,
                    databaseId: x.database_id,
                }));
            }).catch((err) => {
                console.error("[Context]", "Error loading schemas: ", err);
            });

            const schemaPromise = pool.query("SHOW SCHEMA;").then(({ rows }) => {
                if (rows.length > 0) {
                    this.environment.current.schema = rows[0].schema;
                }
            }).catch((err) => {
                console.error("[Context]", "Error loading schema: ", err);
            });

            await Promise.all([schemasPromise, schemaPromise]);
            this.emit("event", { type: EventType.newSchemas });
        }
    }

    private async loadClusters() {
        const pool = await this.pool;

        if (pool) {
            const clustersPromise = pool.query("SELECT id, name, owner_id FROM mz_clusters;").then(({ rows }) => {
                console.log("[Context]", "Setting clusters.");
                this.environment.clusters = rows.map(x => ({
                    id: x.id,
                    name: x.name,
                    ownerId: x.owner_id,
                }));
            }).catch((err) => {
                console.error("[Context]", "Error loading clusters: ", err);
            });

            const clusterPromise = pool.query("SHOW CLUSTER;").then(({ rows }) => {
                if (rows.length > 0) {
                    this.environment.current.cluster = rows[0].cluster;
                }
            }).catch((err) => {
                console.error("[Context]", "Error loading cluster: ", err);
            });

            await Promise.all([clustersPromise, clusterPromise]);
            this.emit("event", { type: EventType.newClusters });
        }
    }

    private loadConfig(): Config {
        // Load configuration

        try {
            if (!this.checkFileOrDirExists(this.configDir)) {
                this.createFileOrDir(this.configDir);
            }
        } catch (err) {

        }

        if (!this.checkFileOrDirExists(this.configFilePath)) {
            writeFileSync(this.configFilePath, '');
        }

        try {
            let configInToml = readFileSync(this.configFilePath, 'utf-8');
            try {
                return (TOML.parse(configInToml)) as Config;
            } catch (err) {
                console.error("Error parsing configuration file.");
                throw err;
            }
        } catch (err) {
            console.error("Error reading the configuration file.", err);
            throw err;
        }
    }

    private checkFileOrDirExists(path: string): boolean {
        try {
          accessSync(path);
          return true;
        } catch (error) {
          return false;
        }
    }

    private createFileOrDir(path: string): void {
        try {
          mkdirSync(path);
          console.log("[Context]", "Directory created: ", path);
        } catch (error) {
        //   writeFileSync(path, '');
          console.log("[Context]", "File created:", path);
        }
    }

    getProfileNames(): Array<String> | undefined {
        if (this.config.profiles) {
            return Object.keys(this.config.profiles);
        }
        return undefined;
    }

    /// Returns the current profile.
    getProfile(): Profile | undefined {
        if (this.config) {
            const { profile, profiles } = this.config;

            if (profile) {
                if (profiles) {
                    return profiles[profile];
                } else {
                    console.log("[Context]", "Missing profiles.");
                }
            } else {
                console.log("[Context]", "Missing profile name.");
            }
        } else {
            console.log("[Context]", "Missing config.");
        }

        return undefined;
    }

    getProfileName(): string | undefined {
        return this.config.profile;
    }

    /// Returns a particular profile.
    getProfileByName(name: string): Profile | undefined {
        if (this.config) {
            const { profiles } = this.config;

            if (profiles) {
                return profiles[name];
            }
        }

        return undefined;
    }

    private saveContext() {
        const configToml = TOML.stringify(this.config as any);
        console.log("[Context]","Saving TOML profile.");

        writeFileSync(this.configFilePath, configToml);
    }

    setProfile(name: string) {
        console.log("[Context]", "Setting new profile name: ", name);
        if (this.config) {
            this.config.profile = name;
            // Do not change default profile.
            // this.saveContext();
            this.reload();

            this.emit("event", { type: EventType.profileChange });
        }
    }

    async getEmail(): Promise<string | undefined> {
        if (this.adminClient) {
            const claims = await this.adminClient.getClaims();
            if (typeof claims === "string") {
                return JSON.parse(claims).email as string;
            } else {
                return claims.email as string;
            }
        }

        return undefined;
    }

    async getHost(region: string): Promise<string | undefined> {
        if (this.cloudClient) {
            console.log("[Context]", "Listing cloud providers.");

            const cloudProviders = await this.cloudClient.listCloudProviders();
            console.log("[Context]", "Providers: ", cloudProviders);

            const provider = cloudProviders.find(x => x.id === region);
            console.log("[Context]", "Selected provider: ", provider);
            if (provider) {
                console.log("[Context]", "Retrieving region.");
                const region = await this.cloudClient.getRegion(provider);
                console.log("[Context]", "Region: ", region);

                console.log("[Context]", "Retrieving environment.");
                const environment = await this.cloudClient.getEnvironment(region);
                console.log("[Context]", "Environment: ", environment);
                return environment.environmentdPgwireAddress;
            }
        }

        return undefined;
    }

    async addProfile(name: string, appPassword: AppPassword, region: string) {
        this.config.profile = "vscode";
        const newProfile: Profile = {
            "app-password": appPassword.toString(),
            "region": region,
        };
        if (this.config.profiles) {
            this.config.profiles[name] = newProfile;
        } else {
            this.config.profiles = {
                [name]: newProfile
            };
        }

        this.saveContext();
        this.emit("event", { type: EventType.newProfiles });
        this.setProfile(name);
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
        console.log("TRICK:", this.environment.schemas, this.getDatabase(), this.environment.current.schema);
        return this.environment.schemas.find(x => x.databaseId === this.getDatabase()?.id && x.name === this.environment.current.schema);
    }

    getSchemaId(): String | undefined {
        // TODO: Make this simpler after loading env correctly.
        const schema = this.environment.schemas.find(x => x.name === this.environment.current.schema && x.name === this.environment.current.schema);
        return schema?.id;
    }
}

export default Context;