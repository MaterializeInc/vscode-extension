import * as os from "os";
import { accessSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import * as TOML from "@iarna/toml";
import AppPassword from "./appPassword";
import * as vscode from 'vscode';

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
    private configDir = process.env["MZ_CONFIG_PATH"] || `${this.homeDir}/.config/materialize`;
    private configName = "mz.toml";
    private configFilePath = `${this.configDir}/${this.configName}`;
    config: ConfigFile;
    profile?: NonStorableConfigProfile;

    constructor() {
        this.config = this.loadConfig();
        this.profile = this.loadDefaultProfile();
    }

    private profileToNonStorable(name: string, profile: ConfigProfile | undefined) {
        return {
            ...JSON.parse(JSON.stringify(profile)),
            database: undefined,
            cluster: undefined,
            schema: undefined,
            name,
        };
    }

    private loadDefaultProfile(): NonStorableConfigProfile | undefined {
        if (this.config.profiles && this.config.profile) {
            const profileName = this.config.profile;
            const profile = this.config.profiles[profileName];

            if (!profile) {
                vscode.window.showErrorMessage(`Error. The selected default profile '${profileName}' does not exist.`);
                return;
            }

            return this.profileToNonStorable(this.config.profile, profile);
        } else {
            console.log("[Config]", "Error loading the default user profile. Most chances are that the user is new.");
        }
    }

    private loadConfig(): ConfigFile {
        // Load configuration
        try {
            if (!this.checkFileOrDirExists(this.configDir)) {
                this.createFileOrDir(this.configDir);
            }
        } catch (err) {
            vscode.window.showErrorMessage('Error creating the configuration directory.');
        }

        if (!this.checkFileOrDirExists(this.configFilePath)) {
            writeFileSync(this.configFilePath, '');
        }

        try {
            let configInToml = readFileSync(this.configFilePath, 'utf-8');
            try {
                return TOML.parse(configInToml) as ConfigFile;
            } catch (err) {
                vscode.window.showErrorMessage('Error parsing the configuration file.');
                console.error("Error parsing configuration file.");
                throw err;
            }
        } catch (err) {
            vscode.window.showErrorMessage('Error reading the configuration file.');
            console.error("Error reading the configuration file.", err);
            throw err;
        }
    }

    /// Adds and saves a new profile into the configuration file
    async addAndSaveProfile(
        name: string,
        appPassword: AppPassword,
        region: string,
        cloudEndpoint?: string,
        adminEndpoint?: string,
    ) {
        // Turn it into the new default profile.
        this.config.profile = name;
        const newProfile: ConfigProfile = {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            "app-password": appPassword.toString(),
            "region": region,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            "cloud-endpoint": cloudEndpoint,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            "admin-endpoint": adminEndpoint,
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

    /// Adds and saves a new profile into the configuration file
    async removeAndSaveProfile(
        name: string,
    ) {
        // Turn it into the new default profile.
        let newProfileName;

        if (this.config.profiles) {
            console.log("[Config]", "Deleting profile: ", name);
            delete this.config.profiles[name];

            if (this.config.profile === name) {
                console.log("[Config]", "Deleted profile was the default one.");

                // Assign a new profile name as default
                const profileNames = this.getProfileNames();
                if (profileNames && profileNames.length > 0) {
                    newProfileName = profileNames[0].toString();
                    this.config.profile = newProfileName;
                } else {
                    delete this.config.profile;
                    delete this.config.profiles;
                }
            }
        }

        this.save();

        if (newProfileName) {
            this.setProfile(newProfileName);
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
            if (!existsSync(path)) {
                try {
                    mkdirSync(path, { recursive: true });
                    console.log("[Context]", "Directory created: ", path);
                } catch (error) {
                    console.log("[Context]", "Error creating configuration file dir:", path, error);
                    throw error;
                }
            }
        } catch (error) {
            console.log("[Context]", "Error checking if the configuration file exists:", path, error);
            throw error;
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
        console.log("[Config]", "Profile's cluster: ", this.profile?.cluster);
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

    setSchema(name: string | undefined) {
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