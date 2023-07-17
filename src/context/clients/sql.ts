import { Pool, QueryResult } from "pg";
import { Profile } from "../context";
import { randomUUID } from "crypto";
import { ProfileContext } from "../profileContext";

export default class SqlClient {
    private pool: Promise<Pool>;
    private context: ProfileContext;
    private profile: Profile;

    constructor(
        context: ProfileContext,
        profile: Profile
    ) {
        this.context = context;
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

    async connected() {
        await this.pool;

        return true;
    }

    private async buildPoolConfig() {
        // TODO: Can be done in parallel
        console.log("[Context]", "Loading host.");
        const host = await this.context.getHost(this.profile.region);
        console.log("[Context]", "Loading user email.");
        const email = await this.context.getEmail();

        return {
            host: host && host.substring(0, host.length - 5),
            // eslint-disable-next-line @typescript-eslint/naming-convention
            application_name: "mz_vscode",
            database: (this.context.getDatabase()?.name || "materialize").toString(),
            port: 6875,
            user: email,
            options: this.context.getConnectionOptions(),
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
}