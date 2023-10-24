import * as os from "os";
import { accessSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import * as TOML from "@iarna/toml";
import AppPassword from "./appPassword";
import * as vscode from 'vscode';
import * as keychain from "keychain";
import { KeychainError } from "keychain";

export interface Profile {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "app-password"?: string,
    region: string,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "admin-endpoint"?: string,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "cloud-endpoint"?: string,
    "vault"?: string,
}

export interface File {
    profile?: string;
    vault?: string;
    profiles?: { [name: string] : Profile; }
}

/// Make sure if you ever change this value,
/// to be compatible with the mz CLI keychain service.
const KEYCHAIN_SERVICE = "Materialize";

export class Config {
    private homeDir = os.homedir();
    private configDir = process.env["MZ_CONFIG_PATH"] || `${this.homeDir}/.config/materialize`;
    private configName = "mz.toml";
    private configFilePath = `${this.configDir}/${this.configName}`;
    readonly config: File;
    profile?: Profile;
    profileName?: string;

    constructor() {
        this.config = this.loadConfig();
        this.applyMigration();
        const profileInfo = this.loadDefaultProfile();

        if (profileInfo) {
            const { profile, profileName } = profileInfo;
            this.profile = profile;
            this.profileName = profileName;
        }
    }

    /**
     * Checks if a profile should use the macOS keychain or not.
     * @param profile profile requesting the keychain.
     * @returns true if should use macOS keychain.
     */
    private shouldUseKeychain(profile: Profile): boolean {
        if (process.platform === "darwin") {
            let vault = profile.vault || this.config.vault;
            if (!vault || vault === "keychain") {
                return true;
            }
        }

        return false;
    }

    /**
     * Migrates all the profiles to the keychain if the user is using macOS.
     * The keychain is more secure than having the passwords in plain text.
     * TODO: Remove after 0.3.0
     */
    private applyMigration() {
        const profiles = this.config.profiles;
        const updateKeychainPromises = [];

        for (const profileName in profiles) {
            const profile = profiles[profileName];

            if  (this.shouldUseKeychain(profile)) {
                const appPassword = profile["app-password"];
                if (appPassword) {
                    updateKeychainPromises.push(new Promise<void>((res) => {
                        this.setKeychainPassword(profileName, appPassword).then(() => {
                            delete profile["app-password"];
                        }).finally(() => {
                            res();
                        });
                    }));
                }
            }
        }

        Promise.all(updateKeychainPromises).then(() => {
            this.save();
        });
    }

    private loadDefaultProfile(): { profile: Profile, profileName: string } | undefined {
        if (this.config.profiles && this.config.profile) {
            const profileName = this.config.profile;
            const profile = this.config.profiles[profileName];

            if (!profile) {
                // TODO: Display in the profile section.
                vscode.window.showErrorMessage(`Error. The selected default profile '${profileName}' does not exist.`);
                return;
            }

            return { profile, profileName };
        } else {
            console.log("[Config]", "Error loading the default user profile. Most chances are that the user is new.");
        }
    }

    private loadConfig(): File {
        // Load configuration
        try {
            if (!this.checkFileOrDirExists(this.configDir)) {
                this.createFileOrDir(this.configDir);
            }
        } catch (err) {
            console.error("[Config]", "Error loading config: ", err);
            // TODO: Display this in the profile config section.
            vscode.window.showErrorMessage('Error creating the configuration directory.');
        }

        if (!this.checkFileOrDirExists(this.configFilePath)) {
            writeFileSync(this.configFilePath, '');
        }

        try {
            console.log("[Config]", "Config file path: ", this.configFilePath);
            let configInToml = readFileSync(this.configFilePath, 'utf-8');
            return TOML.parse(configInToml) as File;
        } catch (err) {
            console.error("[Config]", "Error reading the configuration file.", err);
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
        vault?: string,
    ) {
        // Turn it into the new default profile.
        this.config.profile = name;
        const appPasswordAsString = appPassword.toString();

        const newProfile: Profile = {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            "app-password": appPasswordAsString,
            "region": region,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            "cloud-endpoint": cloudEndpoint,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            "admin-endpoint": adminEndpoint,
            "vault": vault || this.config.vault
        };

        if (this.shouldUseKeychain(newProfile)) {
            newProfile["app-password"] = undefined;
            await this.setKeychainPassword(name, appPasswordAsString);
        }

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

            const isConfigDefault = this.config.profile === name;

            // Assign a new profile name as default
            const profileNames = this.getProfileNames();
            if (profileNames && profileNames.length > 0) {
                newProfileName = profileNames[0].toString();

                if (isConfigDefault) {
                    this.config.profile = newProfileName;
                }
            } else {
                delete this.config.profile;
                delete this.config.profiles;
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
    getProfile(): Profile | undefined {
        if (this.profile) {
            return this.profile;
        } else {
            console.log("[Context]", "Missing config.");
        }

        return undefined;
    }

    /// Sets a keychain app-passwords
    async setKeychainPassword(account: string, appPassword: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const cb = (err: KeychainError): void => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            };

            keychain.setPassword({
                account,
                password: appPassword,
                service: KEYCHAIN_SERVICE,
                type: "generic",
            }, cb);
        });
    }

    /// Gets a keychain app-password for a profile
    async getKeychainPassword(account: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const cb = (err: KeychainError, password: string): void => {
                if (err) {
                    reject(err);
                } else {
                    resolve(password);
                }
            };

            keychain.getPassword({
                account,
                service: "Materialize",
            }, cb);
        });
    }

    /**
     * Searches and returns the vault value.
     * First look the vault value in the porifle,
     * if nothing is set, search the global value,
     * if there is no global value, determine using the platform.
     * @returns the vault value for the current host + config combo.
     */
    getVault(): string {
        return (this.profile && this.profile.vault) ||
                this.config.vault ||
                (process.platform === "darwin" ? "keychain" : "inline");
    }

    /**
     * @returns the app-password of the current profile.
     */
    async getAppPassword(): Promise<string | undefined> {
        const {
            vault,
            appPassword
        } = this.profile ? {
            vault: this.profile.vault,
            appPassword: this.profile["app-password"]
        } : {
            vault: this.config.vault,
            appPassword: undefined
        };

        // TODO: Handle cases when keychain is enable but host is not macOS.
        if (this.profile && this.profileName && this.shouldUseKeychain(this.profile)) {
            return await this.getKeychainPassword(this.profileName);
        } else {
            return appPassword;
        }
    }

    /**
     * @returns the admin endpoint of the current profile
     */
    getAdminEndpoint(): string | undefined {
        if (this.profile) {
            if (this.profile["admin-endpoint"]) {
                return this.profile["admin-endpoint"];
            } else if (this.profile["cloud-endpoint"]) {
                const cloudUrl = new URL(this.profile["cloud-endpoint"]);
                const { hostname } = cloudUrl;
                if (hostname.startsWith("api.")) {
                    cloudUrl.hostname = "admin." + hostname.slice(4);
                    return cloudUrl.toString();
                } else {
                    console.error("The admin endpoint is invalid.");
                    return undefined;
                }
            }
        }

        return undefined;
    }

    /// Returns the current profile name.
    getProfileName(): string | undefined {
        return this.profileName;
    }

    /// Changes the current profile
    setProfile(name: string) {
        console.log("[Context]", "Setting new profile name: ", name);

        if (this.config.profiles) {
            const profile = this.config.profiles[name];
            this.profile = profile;
            this.profileName = name;
        } else {
            console.error("Error loading profile. The profile is missing.");
        }
    }
}