import { Pool, PoolClient, PoolConfig, QueryArrayResult, QueryResult } from "pg";
import AdminClient from "./admin";
import CloudClient from "./cloud";
import { Profile } from "../context/config";
import AsyncContext from "../context/asyncContext";
import { Errors, ExtensionError } from "../utilities/error";

export default class SqlClient {
    private pool: Promise<Pool>;
    private privateClient: Promise<PoolClient>;
    private adminClient: AdminClient;
    private cloudClient: CloudClient;
    private context: AsyncContext;
    private profile: Profile;

    constructor(
        adminClient: AdminClient,
        cloudClient: CloudClient,
        profile: Profile,
        context: AsyncContext,
    ) {
        this.adminClient = adminClient;
        this.cloudClient = cloudClient;
        this.profile = profile;
        this.context = context;

        this.pool = new Promise((res, rej) => {
            const asyncOp = async () => {
                try {
                    console.log("[SqlClient]", "Building config.");
                    const config = await this.buildPoolConfig();
                    const pool = new Pool(config);
                    console.log("[SqlClient]", "Connecting pool.");

                    pool.connect().then(() => {
                        console.log("[SqlClient]", "Pool successfully connected.");
                        res(pool);
                    }).catch((err) => {
                        console.error(err);
                        rej(new ExtensionError(Errors.poolConnectionFailure, err));
                    });
                } catch (err) {
                    console.error("[SqlClient]", "Error creating pool: ", err);
                    rej(new ExtensionError(Errors.poolCreationFailure, err));
                }
            };

            asyncOp();
        });

        this.privateClient = new Promise((res, rej) => {
            const asyncOp = async () => {
                try {
                    const pool = await this.pool;
                    const client = await pool.connect();
                    res(client);
                } catch (err) {
                    console.error("[SqlClient]", "Error awaiting the pool: ", err);
                    rej(err);
                }
            };

            asyncOp();
        });
    }

    async connectErr() {
        await this.pool;
    }

    /**
     * Rreturns the connection options for a PSQL connection.
     * @returns string connection options
     */
    private getConnectionOptions(): string {
        const connectionOptions = [];
        const environment = this.context.getEnvironment();

        if (environment) {
            connectionOptions.push(`--cluster=${environment.cluster}`);

            // When a user changes the database, the schema turns undefined.
            // Each database has a different set of schemas.
            // To avoid having an invalid `search_path`, the schema
            // is an empty string and should be avoided its usage.
            if (environment.schema) {
                connectionOptions.push(`-csearch_path=${environment.schema}`);
            }
        }

        return connectionOptions.join(" ");
    }

    private async buildPoolConfig(): Promise<PoolConfig> {
        console.log("[SqlClient]", "Loading host.");
        const hostPromise = this.cloudClient?.getHost(this.profile.region);
        console.log("[SqlClient]", "Loading user email.");
        const emailPromise = this.adminClient?.getEmail();

        const [host, email] = await Promise.all([hostPromise, emailPromise]);
        const environment = this.context.getEnvironment();

        return {
            host: host && host.substring(0, host.length - 5),
            // eslint-disable-next-line @typescript-eslint/naming-convention
            application_name: "mz_vscode",
            database: ((environment && environment.database) || "materialize").toString(),
            port: 6875,
            user: email,
            options: this.getConnectionOptions(),
            password: await this.context.getAppPassword(),
            // Disable SSL for tests
            ssl: (host && host.startsWith("localhost")) ? false : true,
            keepAlive: true
        };
    }

    /**
     * Internal queries are intended for exploring cases.
     * Like quering the catalog, or information about Materialize.
     * Queries goes to the pool, and no client is kept.
     *
     * @param statement
     * @param values
     * @returns query results
     */
    async internalQuery(statement: string, values?: Array<any>): Promise<QueryArrayResult<any>> {
        const pool = await this.pool;
        const results = await pool.query(statement, values);

        return results;
    }


    /**
     * Private queries are intended for the user.
     * A private query reuses always the same client.
     * In this way, it functions like a shell,
     * processing one statement after another.
     *
     * Another important difference is that
     * it returns the values in Array mode.
     *
     * @param statement
     * @param values
     * @returns query results
     */
    async privateQuery(statement: string, values?: Array<any>): Promise<QueryArrayResult<any>> {
        const client = await this.privateClient;
        // Row mode is a must.
        // Otherwise when two columns have the same name, one is dropped
        // Issue: https://github.com/brianc/node-postgres/issues/280
        const results = await client.query({
            rowMode: "array",
            text: statement,
            values
        });

        return results;
    }

    /**
     * Shut down cleanly the pool.
     */
    async end() {
        try {
            const pool = await this.pool;
            await pool.end();
        } catch (err) {
            console.error("[SqlClient]", "Error ending the pool: ", err);
        }
    }
}