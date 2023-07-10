import { Pool, QueryResult } from "pg";
import Context, { EventType, Profile } from "./context";
import { randomUUID } from "crypto";

export default class SqlClient {
    pool: Promise<Pool>;
    context: Context;
    profile: Profile;

    constructor(
        context: Context,
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

    async query(statement: string): Promise<QueryResult<any>> {
        const results = await (await this.pool).query(statement);

        return results;
    }

    async cursorQuery(statement: string) {
        (await this.pool).connect(async (err, client, done) => {
            const id = randomUUID();
            try {
                const batchSize = 100; // Number of rows to fetch in each batch

                await client.query("BEGIN");
                await client.query(`DECLARE ${id} CURSOR FOR ${statement})`);

                // Run the query
                let results: QueryResult = await client.query(`FETCH ${batchSize} c`);

                while (results.rowCount > 0) {
                    results = await client.query(`FETCH ${batchSize} c`);
                    this.context.emit("event", { type: EventType.queryResults, data: { id, results }});
                }
              } finally {
                // Release the client and pool resources
                done();
              }
        });
    }
}