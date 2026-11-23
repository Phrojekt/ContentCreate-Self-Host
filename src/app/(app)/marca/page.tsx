import { projectConfig } from "@config/project.config";

import { IdentityEditor } from "@/components/settings/identity-editor";
import { DIMENSIONS } from "@/constants/rendering";
import { getEffectiveSettings } from "@/services/settings/settings-store";

export const dynamic = "force-dynamic";

const card = "rounded-2xl border border-line bg-surface p-5 md:p-6";

/** Regras de correção do conteúdo (resumo de src/services/llm/prompt.ts). */
const RULES = [
  [
    "R0",
    "Português do Brasil",
    "Todo texto gerado em PT-BR, inclusive citações traduzidas.",
  ],
  [
    "R1",
    "Zero invenção",
    "Número, nome ou resultado só se estiver literalmente na matéria.",
  ],
  [
    "R2",
    "Reescrita editorial",
    "Nada de cópia: frases e estrutura próprias, sempre creditando a fonte.",
  ],
  [
    "R3",
    "Gancho específico",
    "Cada slide abre com algo que só existe nesta notícia.",
  ],
  [
    "R4",
    "Corpo completo",
    "Slides desenvolvem o argumento, não só enunciam o fato.",
  ],
  ["R5", "Fechamento", "Último slide com pergunta real e o CTA da marca."],
] as const;

/** Identidade editável (DEC-027): perfil, rede, nicho e cores no banco. */
export default async function MarcaPage() {
  const settings = await getEffectiveSettings();
  const { post } = projectConfig;
  const dims = DIMENSIONS[post.format];

  return (
    <main className="px-5 pt-5 pb-10 md:px-10 md:pt-7 md:pb-12">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-5">
        <header className="flex flex-col gap-1.5">
          <h1 className="m-0 text-[22px] font-bold tracking-[-0.02em] md:text-[26px]">
            Identidade
          </h1>
          <p className="m-0 max-w-[720px] text-sm leading-normal text-muted">
            Como o perfil se apresenta e como o post se parece. As mudanças
            valem para as próximas prévias, exportações e rodadas — o layout dos
            slides é fixo; aqui você muda nome, perfil, tema e cores.
          </p>
        </header>

        <IdentityEditor initial={settings} />

        <div className="grid gap-5 md:grid-cols-3">
          <section aria-label="Formato" className={card}>
            <h2 className="m-0 mb-3 text-base font-semibold">Formato</h2>
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
              <dt className="text-muted">Post</dt>
              <dd className="m-0 font-medium">
                {post.format === "portrait" ? "Retrato 4:5" : "Quadrado 1:1"} ·{" "}
                {dims.width}×{dims.height}
              </dd>
              <dt className="text-muted">Carrossel</dt>
              <dd className="m-0 font-medium">
                {post.carousel.enabled
                  ? `até ${post.carousel.maxSlides} slides`
                  : "post único"}
              </dd>
              <dt className="text-muted">Fonte</dt>
              <dd className="m-0 font-medium">
                {projectConfig.theme.design.fontFamily}
              </dd>
              <dt className="text-muted">Idioma</dt>
              <dd className="m-0 font-medium">
                {projectConfig.theme.language}
              </dd>
            </dl>
            <p className="m-0 mt-3 text-xs text-muted">
              Formato e fonte vêm de{" "}
              <code className="font-mono">config/project.config.ts</code>.
            </p>
          </section>

          <section
            aria-label="Regras do conteúdo"
            className={`${card} md:col-span-2`}
          >
            <h2 className="m-0 mb-1 text-base font-semibold">
              Regras do conteúdo
            </h2>
            <p className="m-0 mb-4 text-[13px] text-muted">
              Valem para todo rascunho, em qualquer tema, e são conferidas pelo
              verificador antes de chegar à Revisão.
            </p>
            <ol className="m-0 grid list-none gap-3 p-0 md:grid-cols-2">
              {RULES.map(([code, title, text]) => (
                <li
                  key={code}
                  className="flex gap-3 rounded-xl bg-surface-2 p-3.5"
                >
                  <span className="font-mono text-xs font-semibold text-accent-ink">
                    {code}
                  </span>
                  <span className="flex flex-col gap-1">
                    <span className="text-sm font-semibold">{title}</span>
                    <span className="text-[13px] leading-normal text-ink-2">
                      {text}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </main>
  );
}
