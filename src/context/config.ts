import * as os from "os";
import { accessSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import EventEmitter = require("node:events");
import * as TOML from "@iarna/toml";
import AppPassword from "./appPassword";

/// The NonStorableConfigProfile additional properties for Config
/// That can't be stored due to compatibility issues with the CLI.
export interface NonStorableConfigProfile extends ConfigProfile {
    cluster: string | undefined,
    database: string | undefined,
    schema: string | undefined,
    name: string | undefined,
}

export interface ConfigProfile {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "app-password": string,
    region: string,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "admin-endpoint"?: string,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "cloud-endpoint"?: string,
}

export interface ConfigFile {
    profile?: string;
    profiles?: { [name: string] : ConfigProfile; }
}

export class Config {
    private homeDir = os.homedir();
    private configDir = `${this.homeDir}/.config/materialize`;
    private configName = "mz.toml";
    private configFilePath = `${this.configDir}/${this.configName}`;
    config: ConfigFile;
    profile?: NonStorableConfigProfile;

    constructor() {
        this.config = this.loadConfig();
        this.profile = this.loadDefaultProfile();
    }

    private profileToNonStorable(name: string, profile: ConfigProfile) {
        return {
            ...JSON.parse(JSON.stringify(profile)),
            database: undefined,
            cluster: undefined,
            schema: undefined,
            name,
        };
    }

    private loadDefaultProfile(): NonStorableConfigProfile | undefined {
        // TODO: Capture error while cloning.
        if (this.config.profiles && this.config.profile) {
            return this.profileToNonStorable(this.config.profile, this.config.profiles[this.config.profile]);
        }
    }

    private loadConfig(): ConfigFile {
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
                return TOML.parse(configInToml) as ConfigFile;
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

    /// Adds a new profile to the configuration file
    async addProfile(name: string, appPassword: AppPassword, region: string) {
        // Turn it into the new default profile.
        this.config.profile = name;
        const newProfile: ConfigProfile = {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            "app-password": appPassword.toString(),
            "region": region,
        };

        if (this.config.profiles) {
            this.config.profiles[name] = newProfile;
        } else {
            this.config.profiles = {
                [name]: newProfile
            };
        };

        this.save();
        this.setProfile(name);
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

    /// Stores the context in the configuration file.
    save() {
        const configToml = TOML.stringify(this.config as any);
        console.log("[Context]","Saving TOML profile.");

        writeFileSync(this.configFilePath, configToml);
    }

    /// Returns all the profile names
    getProfileNames(): Array<String> | undefined {
        if (this.config.profiles) {
            return Object.keys(this.config.profiles);
        }
        return undefined;
    }

    /// Returns the current profile.
    getProfile(): NonStorableConfigProfile | undefined {
        if (this.profile) {
            return this.profile;
        } else {
            console.log("[Context]", "Missing config.");
        }

        return undefined;
    }

    /// Returns the current profile name.
    getProfileName(): string | undefined {
        return this.profile?.name;
    }

    getDatabase(): string | undefined {
        return this.profile?.database;
    }

    getCluster(): string | undefined {
        console.log("[Config]", this.profile?.cluster);
        return this.profile?.cluster;
    }

    getSchema(): string | undefined {
        return this.profile?.schema;
    }

    /// Changes the current profile
    setProfile(name: string) {
        console.log("[Context]", "Setting new profile name: ", name);

        if (this.config.profiles) {
            const profile = this.config.profiles[name];
            this.profile = this.profileToNonStorable(name, profile);
        } else {
            console.error("Error loading profile. The profile is missing.");
        }
    }

    setDatabase(name: string) {
        if (this.profile) {
            this.profile.database = name;
        }
    }

    setCluster(name: string) {
        if (this.profile) {
            this.profile.cluster = name;
        }
    }

    setSchema(name: string) {
        if (this.profile) {
            this.profile.schema = name;
        }
    }

    getRegion() {
        if (this.profile) {
            return this.profile.region;
        }
    }
}