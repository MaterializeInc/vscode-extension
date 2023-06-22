/* eslint-disable @typescript-eslint/naming-convention */
import * as TOML from "@iarna/toml";
import * as os from "os";
import { accessSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import EventEmitter = require("node:events");
import AdminClient from "./AdminClient";
import CloudClient from "./CloudClient";
import { Pool } from "pg";
import AppPassword from "./AppPassword";

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
    queryResults
}

export default class Context extends EventEmitter {
    private homeDir = os.homedir();
    private configDir = `${this.homeDir}/.config/materialize`;
    private configName = "mz.toml";
    private configFilePath = `${this.configDir}/${this.configName}`;


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