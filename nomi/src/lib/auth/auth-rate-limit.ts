import "server-only";

import { createHash } from "node:crypto";
import { pool } from "../db/pool";

export async function checkAuthRateLimit(
  identifier: string,
  maxAttempts = 5,
  windowMinutes = 15,
): Promise<boolean> {
  const keyHash = createHash("sha256").update(identifier).digest("hex");

  const debug = await pool.query(`
    SELECT
      current_user,
      session_user,
      current_database(),
      current_schema(),
      inet_server_addr()::text AS server_address,
      inet_server_port() AS server_port,
      has_table_privilege(
        current_user,
        'public.auth_rate_limits',
        'INSERT'
      ) AS can_insert,
      has_table_privilege(
        current_user,
        'public.auth_rate_limits',
        'UPDATE'
      ) AS can_update,
      has_table_privilege(
        current_user,
        'public.auth_rate_limits',
        'SELECT'
      ) AS can_select
  `);

  console.log("DATABASE CONNECTION DEBUG:", debug.rows[0]);

  const result = await pool.query<{
    attempts: number;
  }>(
    `INSERT INTO auth_rate_limits
       (key_hash, attempts, window_start)
     VALUES ($1, 1, NOW())
     ON CONFLICT (key_hash)
     DO UPDATE SET
       attempts = CASE
         WHEN auth_rate_limits.window_start <
           NOW() - ($2::integer * INTERVAL '1 minute')
         THEN 1
         ELSE auth_rate_limits.attempts + 1
       END,
       window_start = CASE
         WHEN auth_rate_limits.window_start <
           NOW() - ($2::integer * INTERVAL '1 minute')
         THEN NOW()
         ELSE auth_rate_limits.window_start
       END
     RETURNING attempts`,
    [keyHash, windowMinutes],
  );

  return result.rows[0].attempts <= maxAttempts;
}
