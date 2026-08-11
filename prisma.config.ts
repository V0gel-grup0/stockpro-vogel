import { config as loadEnv } from "dotenv";
import { defineConfig, env } from "prisma/config";

// O Next.js carrega .env.local automaticamente, mas o Prisma CLI nao.
// Carregamos primeiro .env.local e depois .env como fallback, sem sobrescrever
// variaveis que ja existam no ambiente.
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
