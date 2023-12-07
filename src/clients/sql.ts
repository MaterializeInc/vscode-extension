import { Pool, PoolClient, PoolConfig, QueryArrayResult } from "pg";
import AdminClient from "./admin";
import CloudClient from "./cloud";
import { Profile } from "../context/config";
import AsyncContext from "../context/asyncContext";

export default class SqlClient {
    private pool: Promise<Pool>;
    private privateClient: Promise<PoolClient>;
    private adminClient: AdminClient;
    private cloudClient: CloudClient;
    private context: AsyncContext;
    private profile: Profile;
    private ended: boolean;

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
        this.ended = false;
        this.pool = this.buildPool();
        this.privateClient = this.buildPrivateClient();
        this.handleReconnection();
    }

    /**
     * Reconnects the pool and creates a new private client.
     *
     * This is useful to reconnect on errors, or when wanting
     * to abort a query.
     */
    async reconnect() {
        try {
            const client = await this.privateClient;
            client.release();
        } catch (err) {
            console.error("[SqlClient]", "Error aborting private client:", err);
        } finally {
            try {
                const pool = await this.pool;
                pool.end();
            } catch (err) {
                console.error("[SqlClient]", "Error ending pool. It is ok it the pool connection failed:", err);
            } finally {
                this.pool = this.buildPool();
                this.privateClient = this.buildPrivateClient();
                this.handleReconnection();
            }
        }
    }

    /**
     * Handles the reconnection from the pool or private client
     * when there is a connection issue.
     */
    private async handleReconnection() {
        let reconnecting = false;

        const reconnect = (err: Error) => {
            console.error("[SqlClient]", "Unexpected error: ", err);
            console.log("[SqlClient]", "Reconnecting.");
            if (reconnecting === false && this.ended === false) {
                reconnecting = true;
                const interval = setInterval(async () => {
                    this.reconnect();
                    clearInterval(interval);
                }, 5000);
            }
        };

        try {
            const pool = await this.pool;
            pool.on("error", reconnect);

            try {
                const client = await this.privateClient;
                client.on("error", reconnect);
            } catch (err) {
                reconnect(err as Error);
                console.error("[SqlClient]", "Unexpected error on client: ", err);
            }
        } catch (err) {
            reconnect(err as Error);
            console.error("[SqlClient]", "Unexpected error on pool: ", err);
        }
    }

    /**
     * @returns a client form the pool.
     */
    private async buildPrivateClient(): Promise<PoolClient> {
        const pool = await this.pool;
        return pool.connect();
    }

    /**
     * @returns a Postgres connection pool.
     */
    private async buildPool(): Promise<Pool> {
        return new Pool(await this.buildPoolConfig());
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
    async internalQuery(statement: string, values?: Array<string | number>): Promise<QueryArrayResult<any>> {
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
        this.ended = true;

        try {
            const pool = await this.pool;
            await pool.end();
        } catch (err) {
            console.error("[SqlClient]", "Error ending the pool: ", err);
        }
    }
}