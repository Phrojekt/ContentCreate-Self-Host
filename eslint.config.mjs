import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  globalIgnores([
    "node_modules/**",
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
    "prisma/migrations/**",
    "src/generated/**",
    // Assets de documentação (preview do Claude Design) e rascunhos locais —
    // não são código-fonte do projeto.
    "docs/**",
    "tmp/**",
  ]),
  ...nextVitals,
  ...nextTs,
  // Desliga regras que conflitam com o Prettier — deve vir por último.
  prettier,
]);

export default eslintConfig;
