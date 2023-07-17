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
import { EnvironmentContext } from "./environmentContext";

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
export class ProfileContext extends EventEmitter {

    adminClient!: AdminClient;
    cloudClient!: CloudClient;
    sqlClient!: SqlClient;

    profile: Profile;
    environment: EnvironmentContext;

    constructor(profile: Profile) {
        super();
        this.profile = profile;

        this.adminClient = new AdminClient(this.profile["app-password"]);
        this.cloudClient = new CloudClient(this.adminClient);
        this.sqlClient = new SqlClient(this, this.profile);
        this.environment = new EnvironmentContext(this.adminClient, this.cloudClient, this.sqlClient);

        // Wait the pool to be ready to announce the we are connected.
        this.sqlClient.connected().then(() => {
            this.emit("event", { type: EventType.connected });
        });
    }

    getConnectionOptions(): string {
        const connectionOptions = [];
        const cluster = this.environment.getCluster();
        if (cluster) {
            connectionOptions.push(`--cluster=${cluster}`);
        };

        const schema = this.environment.getSchema();
        if (schema) {
            connectionOptions.push(`-csearch_path==${schema}`);
        }

        return connectionOptions.join(" ");
    }

    async getEmail(): Promise<string> {
        return await this.adminClient.getEmail();
    }

    /**
     *
     * @param regionId Possible values: "aws/us-east-1", "aws/eu-west-1"
     * @returns
     */
    async getHost(regionId: "aws/us-east-1" | "aws/eu-west-1"): Promise<string | undefined> {
        return await this.cloudClient.getHost(regionId);
    }
}

export default Context;