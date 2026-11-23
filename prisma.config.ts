// Configuração do Prisma CLI (Prisma 7).
// A URL de conexão usada por Migrate vive aqui (não no schema.prisma).
// `dotenv/config` carrega o `.env` para os comandos do CLI (migrate, generate).
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
