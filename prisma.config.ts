import "dotenv/config";
import { defineConfig } from "prisma/config";

// `prisma generate` does not need a database connection — only migrations and
// `db push` do. Prisma's own env() helper THROWS when the variable is missing,
// which turns a `postinstall: prisma generate` into a hard `npm install` failure
// on any host where DATABASE_URL isn't present at install time (Vercel, CI).
//
// So read it leniently here and only attach the datasource when it exists. A
// migration run without it then fails with Prisma's clear "no datasource url"
// message instead of an opaque config-loading error.
const url = process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  ...(url ? { datasource: { url } } : {}),
});
