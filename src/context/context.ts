import * as toml from "toml";
import * as os from "os";
import { accessSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import EventEmitter = require("node:events");
import AdminClient from "./AdminClient";
import CloudClient from "./CloudClient";
import { Pool } from "pg";

export interface Profile {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "app-password": string,
    region: string,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "admin-endpoint": string,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "cloud-endpoint": string,
}

export interface Config {
    profile?: string;
    profiles?: { [name: string] : Profile; }
}

export enum EventType {
    profileChange,
    connected,
    queryResults
}

export default class Context extends EventEmitter {
    config: Config;
    adminClient?: AdminClient;
    cloudClient?: CloudClient;
    pool?: Promise<Pool>;

    constructor() {
        super();
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
                        port: 6875,
                        user: email,
                        password: profile["app-password"],
                        ssl: true,
                    });

                    console.log("[Context]", "Connecting pool.");
                    pool.connect().catch((err) => {
                        console.error(err);
                        rej(err);
                    }).finally(() => {
                        console.log("[Context]", "Pool successfully connected.");
                        res(pool);
                        this.emit("event", { type: EventType.connected });
                    });
                });
            });
        });
    }

    private loadConfig(): Config {
        // Load configuration
        const homeDir = os.homedir();
        const configDir = `${homeDir}/.config/materialize`;

        if (!this.checkFileOrDirExists(configDir)) {
            this.createFileOrDir(configDir);
        }


        const configName = "mz.toml";
        const configFilePath = `${configDir}/${configName}`;
        if (!this.checkFileOrDirExists(configFilePath)) {
            this.createFileOrDir(configFilePath);
        }

        try {
            let configInToml = readFileSync(configFilePath, 'utf-8');
            try {
                return (toml.parse(configInToml)) as Config;
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
          writeFileSync(path, '');
          console.log("[Context]", "File created:", path);
        }
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

    saveContext() {
            // TODO: Save into file.
    }

    setProfile(name: string) {
        console.log("[Context]", "Setting new profile name: ", name);
        if (this.config) {
            this.config.profile = name;
            this.saveContext();
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

    async getCluster(): Promise<string | undefined> {
        if (this.pool) {
            const { rows } = await (await this.pool).query("SHOW CLUSTER;");
            if (rows.length > 0) {
                return rows[0].cluster;
            }
        }

        return undefined;
    }
}