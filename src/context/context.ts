/* eslint-disable @typescript-eslint/naming-convention */
import * as TOML from "@iarna/toml";
import * as os from "os";
import { accessSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import EventEmitter = require("node:events");
import AdminClient from "./adminClient";
import CloudClient from "./cloudClient";
import AppPassword from "./AppPassword";
import { MaterializeObject, MaterializeSchemaObject } from "../providers/databaseTreeProvider";
import SqlClient from "./sqlClient";

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
export class Context extends EventEmitter {
    private homeDir = os.homedir();
    private configDir = `${this.homeDir}/.config/materialize`;
    private configName = "mz.toml";
    private configFilePath = `${this.configDir}/${this.configName}`;

    config: Config;
    adminClient?: AdminClient;
    cloudClient?: CloudClient;
    sqlClient?: SqlClient;
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

            this.loadClients();
        }
    }

    private loadClients() {
        console.log("[Context]", "Loading clients.");

        const profile = this.getProfile();

        if (profile) {
            this.adminClient = new AdminClient(profile["app-password"]);
            this.cloudClient = new CloudClient(this.adminClient);
            this.loadSqlClient();
        } else {
            console.error("[Context]", "No profile available for the clients.");
        }
    }

    private loadSqlClient() {
        const profile = this.getProfile();

        if (profile) {
            this.sqlClient = new SqlClient(this, profile);

            // Wait the pool to be ready to announce the we are connected.
            this.sqlClient.connected().then(() => {
                this.emit("event", { type: EventType.connected });
                this.loadEnvironment();
            });
        }
    }

    getConnectionOptions(): string {
        const connectionOptions = [];
        if (this.environment.current.cluster) {
            connectionOptions.push(`--cluster=${this.environment.current.cluster}`);
        };

        if (this.environment.current.schema) {
            connectionOptions.push(`-csearch_path==${this.environment.current.schema}`);
        }

        return connectionOptions.join(" ");
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
        this.config.profile = name;
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
        this.loadSqlClient();
    }

    setSchema(name: String) {
        this.environment.current.schema = name;
        this.emit("event", { type: EventType.environmentChange });
        this.loadSqlClient();
    }

    setCluster(name: String) {
        this.environment.current.cluster = name;
        this.emit("event", { type: EventType.environmentChange });
        this.loadSqlClient();
    }
}

export default Context;