import { defineConfig } from "drizzle-kit";

const connectionString = process.env.NEON_DATABASE_URL ?? (process.env.DATABASE_URL?.startsWith("postgres") ? process.env.DATABASE_URL : undefined);
if (!connectionString) {
  throw new Error("NEON_DATABASE_URL or a PostgreSQL DATABASE_URL is required to run drizzle commands");
}

export default defineConfig({
  schema: "./drizzle/schema.ts",
  // Keep the historical MySQL migrations untouched; Neon uses a separate additive history.
  out: "./drizzle-pg",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
