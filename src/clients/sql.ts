import { Pool, QueryResult } from "pg";
import AdminClient from "./admin";
import CloudClient from "./cloud";
import { Profile } from "../context/config";
import AsyncContext from "../context/asyncContext";
import { Errors, ExtensionError } from "../utilities/error";

export default class SqlClient {
    private pool: Promise<Pool>;
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

    private async buildPoolConfig() {
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
        };
    }

    async query(statement: string, values?: Array<any>): Promise<QueryResult<any>> {
        const pool = await this.pool;
        const results = await pool.query(statement, values);

        return results;
    }

    async* cursorQuery(statement: string): AsyncGenerator<QueryResult> {
        const pool = await this.pool;
        const client = await pool.connect();

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
}