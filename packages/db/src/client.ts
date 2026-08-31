import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as dotenv from 'dotenv';
import { resolve } from 'node:path';
import * as schema from './schema/index.js';

// Load .env from root or current directory
dotenv.config({ path: resolve(process.cwd(), '../../.env') });
dotenv.config({ path: resolve(process.cwd(), '.env') });
dotenv.config();

const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:postgrespassword@localhost:5432/bcn_internships';

/**
 * PostgreSQL connection pool instance using postgres.js
 */
export const queryClient = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

/**
 * Drizzle ORM database instance typed with all schemas and relations
 */
export const db = drizzle(queryClient, { schema });

export type Database = typeof db;
export { schema };
