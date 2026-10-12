interface Row {
  key: string;
  code_hash: string;
  attempts: number;
  expires_at: number;
}

export interface FakeOtpDb {
  DB: { prepare: (sql: string) => unknown };
  rows: Map<string, Row>;
}

export function fakeOtpDb(fallback?: (sql: string) => unknown): FakeOtpDb {
  const rows = new Map<string, Row>();

  const prepare = (sql: string) => {
    if (!sql.includes("otp_codes")) {
      if (fallback) return fallback(sql);
      throw new Error(`the fake was not taught this statement: ${sql}`);
    }
    return {
      bind: (...args: unknown[]) => {
        const run = async (): Promise<{ meta: { changes: number } }> => {
          if (sql.includes("DELETE") && sql.includes("expires_at <=")) {
            const cutoff = args[0] as number;
            let changes = 0;
            for (const [key, row] of rows) {
              if (row.expires_at <= cutoff) {
                rows.delete(key);
                changes += 1;
              }
            }
            return { meta: { changes } };
          }
          if (sql.includes("INSERT INTO otp_codes")) {
            const [key, codeHash, expiresAt] = args as [string, string, number];
            rows.set(key, {
              key,
              code_hash: codeHash,
              attempts: 0,
              expires_at: expiresAt,
            });
            return { meta: { changes: 1 } };
          }
          if (sql.includes("DELETE") && sql.includes("code_hash = ?")) {
            const [key, codeHash] = args as [string, string];
            const row = rows.get(key);
            if (!row || row.code_hash !== codeHash)
              return { meta: { changes: 0 } };
            rows.delete(key);
            return { meta: { changes: 1 } };
          }
          if (sql.includes("DELETE") && sql.includes("key = ?")) {
            const key = args[0] as string;
            return { meta: { changes: rows.delete(key) ? 1 : 0 } };
          }
          throw new Error(`the fake was not taught this statement: ${sql}`);
        };

        const first = async (): Promise<unknown> => {
          if (sql.includes("SELECT")) {
            const row = rows.get(args[0] as string);
            return row
              ? {
                  code_hash: row.code_hash,
                  attempts: row.attempts,
                  expires_at: row.expires_at,
                }
              : null;
          }
          if (sql.includes("UPDATE otp_codes SET attempts")) {
            const [key, cap] = args as [string, number];
            const row = rows.get(key);
            if (!row || row.attempts >= cap) return null;
            row.attempts += 1;
            return { attempts: row.attempts };
          }
          throw new Error(`the fake was not taught this statement: ${sql}`);
        };

        return { run, first };
      },
    };
  };

  return { DB: { prepare }, rows };
}
