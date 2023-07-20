import { Pool, QueryResult } from "pg";
import { randomUUID } from "crypto";
import { NonStorableConfigProfile } from "../context/config";
import { MaterializeObject } from "../providers/schema";
import AdminClient from "./admin";
import CloudClient from "./cloud";

export default class SqlClient {
    private pool: Promise<Pool>;
    private adminClient: AdminClient;
    private cloudClient: CloudClient;
    private profile: NonStorableConfigProfile;

    constructor(
        adminClient: AdminClient,
        cloudClient: CloudClient,
        profile: NonStorableConfigProfile,
    ) {
        this.adminClient = adminClient;
        this.cloudClient = cloudClient;
        this.profile = profile;

        this.pool = new Promise((res, rej) => {
            const asyncOp = async () => {
                console.log("[SqlClient]", "Building config.");
                const config = await this.buildPoolConfig();
                const pool = new Pool(config);
                console.log("[SqlClient]", "Connecting pool.");

                pool.connect().then(() => {
                    console.log("[SqlClient]", "Pool successfully connected.");
                    res(pool);
                }).catch((err) => {
                    console.error(err);
                    rej(err);
                });
            };

            asyncOp();
        });
    }

    /**
     * Rreturns the connection options for a PSQL connection.
     * @returns string connection options
     */
    private getConnectionOptions(): string {
        const connectionOptions = [];

        const cluster = this.profile.cluster;
        if (cluster) {
            connectionOptions.push(`--cluster=${cluster}`);
        };

        const schema = this.profile.schema;
        if (schema) {
            connectionOptions.push(`-csearch_path==${schema}`);
        }

        return connectionOptions.join(" ");
    }

    private async buildPoolConfig() {
        // TODO: Can be done in parallel
        console.log("[Context]", "Loading host.");
        const host = await this.cloudClient?.getHost(this.profile.region);
        console.log("[Context]", "Loading user email.");
        const email = await this.adminClient?.getEmail();

        return {
            host: host && host.substring(0, host.length - 5),
            // eslint-disable-next-line @typescript-eslint/naming-convention
            application_name: "mz_vscode",
            database: (this.profile.database || "materialize").toString(),
            port: 6875,
            user: email,
            options: this.getConnectionOptions(),
            password: this.profile["app-password"],
            ssl: true,
        };
    }

    async query(statement: string, values?: Array<any>): Promise<QueryResult<any>> {
        // TODO: Remove double await.
        const results = await (await this.pool).query(statement, values);

        return results;
    }

    async* cursorQuery(statement: string): AsyncGenerator<QueryResult> {
        // TODO: Remove doulbe await
        const client = await (await this.pool).connect();
        const id = randomUUID();

        try {
            const batchSize = 100; // Number of rows to fetch in each batch

            await client.query("BEGIN");
            await client.query(`DECLARE c CURSOR FOR ${statement}`);
            let finish = false;

            // Run the query
            while (!finish) {
                let results: QueryResult = await client.query(`FETCH ${batchSize} c;`);
                const { rowCount } = results;

                if (rowCount === 0) {
                  finish = true;
                }

                yield results;
            }
        } finally {
            try {
                await client.query("COMMIT;");
            } catch (err) {
                console.error("[SqlClient]", "Error commiting transaction.", err);
            }
            // Release the client and pool resources
            client.release();
        }
    }


    async getDatabases(): Promise<Array<MaterializeObject>> {
        const { rows }: QueryResult<MaterializeObject> = await this.query(`SELECT id, name, owner_id as "ownerId" FROM mz_databases;`);
        return rows;
    }

    async getSchemas(database: MaterializeObject) {
        const { rows: schemas } = await this.query(`SELECT id, name, database_id as "databaseId", owner_id as "ownerId" FROM mz_schemas WHERE database_id = $1`, [database.id]);

        return schemas;
    }

    async getClusters() {
        const { rows: clusters }: QueryResult<MaterializeObject> = await this.query(`SELECT id, name, owner_id as "ownerId" FROM mz_clusters;`);

        return clusters;
    }
}