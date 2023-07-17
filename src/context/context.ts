/* eslint-disable @typescript-eslint/naming-convention */
import * as TOML from "@iarna/toml";
import * as os from "os";
import { accessSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import EventEmitter = require("node:events");
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

    constructor() {
        super();
        this.config = this.loadConfig();
    }

    private loadConfig(): Config {
        // Load configuration

        try {
            if (!this.checkFileOrDirExists(this.configDir)) {
                this.createFileOrDir(this.configDir);
            }
        } catch (err) {
            // TODO: Throw VSCode error notification.
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
            // TODO: Throw VSCode error notification.
            console.error("Error reading the configuration file.", err);
            throw err;
        }
    }

    private checkFileOrDirExists(path: string): boolean {
        try {
          accessSync(path);
          return true;
        } catch (error) {
            // TODO: Throw VSCode error notification.
          return false;
        }
    }

    private createFileOrDir(path: string): void {
        try {
            mkdirSync(path);
            console.log("[Context]", "Directory created: ", path);
        } catch (error) {
            // TODO: Throw VSCode error notification.
            console.log("[Context]", "File created:", path);
        }
    }

    /// Returns all the profile names
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

    /// Returns the current profile name.
    getProfileName(): string | undefined {
        return this.config.profile;
    }

    /// Stores the context in the configuration file.
    private saveContext() {
        const configToml = TOML.stringify(this.config as any);
        console.log("[Context]","Saving TOML profile.");

        writeFileSync(this.configFilePath, configToml);
    }

    /// Changes the current profile
    setProfile(name: string) {
        console.log("[Context]", "Setting new profile name: ", name);
        if (this.config) {
            this.config.profile = name;

            this.emit("event", { type: EventType.environmentChange });
            this.emit("event", { type: EventType.profileChange });
        }
    }

    /// Adds a new profile to the configuration file
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
}

export default Context;