import { AdminClient, CloudClient, SqlClient } from "../clients";
import { Config } from "./config";
import { MaterializeObject, MaterializeSchemaObject } from "../providers/schema";
import LspClient from "../clients/lsp";
import * as vscode from 'vscode';

/**
 * Contains Materialize environment info.
 */
interface Environment {
    clusters: Array<MaterializeObject>;
    schemas: Array<MaterializeSchemaObject>;
    databases: Array<MaterializeObject>;
    schema: string;
    database: string;
    cluster: string;
}

/**
 * Represents the different clients available in the extension.
 */
interface Clients {
    admin?: AdminClient;
    cloud?: CloudClient;
    sql?: SqlClient;
    lsp: LspClient;
}

export class Context {
    protected config: Config;
    protected loaded: boolean;

    // Visual Studio Code Context
    protected vsContext: vscode.ExtensionContext;

    // Clients
    protected clients: Clients;

    // User environment
    protected environment?: Environment;

    constructor(vsContext: vscode.ExtensionContext) {
        this.vsContext = vsContext;
        this.config = new Config();
        this.loaded = false;
        this.clients = {
            lsp: new LspClient()
        };
    }

    stop() {
        this.clients.lsp.stop();
    }

    isLoading(): boolean {
        return !this.loaded;
    }

    /**
     * Returns all the clusters available in the environment.
     * @returns cluster objects.
     */
    getClusters(): MaterializeObject[] | undefined {
        return this.environment?.clusters;
    }

    /**
     * Return the current cluster name.
     * @returns cluster name.
     */
    getCluster(): string | undefined {
        return this.environment?.cluster;
    }

    /**
     * Return all the available database in the environment.
     * @returns database objects.
     */
    getDatabases(): MaterializeObject[] | undefined {
        return this.environment?.databases;
    }

    /**
     * Returns the current database.
     * @returns database name.
     */
    getDatabase(): string | undefined {
        return this.environment?.database;
    }

    /**
     * Returns all the available schemas in the environment database.
     * @returns schema objects.
     */
    getSchemas(): MaterializeSchemaObject[] | undefined {
        return this.environment?.schemas;
    }

    /**
     * Returns the current schema.
     * @returns schema.
     */
    getSchema(): string | undefined {
        return this.environment?.schema;
    }

    /**
     * Returns all the valid profile names in the config file.
     * @returns {array} profile names
     */
    getProfileNames() {
        return this.config.getProfileNames();
    }

    /**
     * Returns the current profile name.
     * @returns {string} profile name.
     */
    getProfileName() {
        return this.config.getProfileName();
    }

    /**
     * @returns context environment
     */
    getEnvironment() {
        return this.environment;
    }
}

export default Context;