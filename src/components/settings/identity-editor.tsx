"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { callApi } from "@/components/ui/client-api";
import { btnDanger, btnSecondary, Dialog } from "@/components/ui/dialog";
import { Toast, useToast } from "@/components/ui/toast";
import {
  SOCIAL_NETWORKS,
  type AppSettingsData,
  type SocialNetwork,
} from "@/lib/settings-schema";
import { CategoriesEditor } from "./categories-editor";
import { ColorField } from "./color-field";

type Profile = AppSettingsData["profile"];
type Colors = AppSettingsData["colors"];

const FIXED: { key: keyof Colors; label: string }[] = [
  { key: "background", label: "Fundo" },
  { key: "surface", label: "Superfície" },
  { key: "grid", label: "Linhas" },
  { key: "title", label: "Título" },
  { key: "muted", label: "Texto secundário" },
];

const card = "rounded-2xl border border-line bg-surface p-5 md:p-6";
const input =
  "h-11 w-full rounded-[10px] border border-line-field bg-surface px-3 text-sm text-ink";
const btnPrimary =
  "h-11 rounded-[10px] border-0 bg-accent px-4 text-sm font-semibold text-white disabled:opacity-60";

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Luminância relativa (WCAG) — para avisar contraste título × fundo. */
function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}
function contrast(a: string, b: string): number {
  if (!HEX.test(a) || !HEX.test(b)) return 21;
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x! + 0.05) / (y! + 0.05);
}

export function IdentityEditor({ initial }: { initial: AppSettingsData }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const { toast, show, hide } = useToast();
  const [profile, setProfile] = useState<Profile>(initial.profile);
  const [colors, setColors] = useState<Colors>(initial.colors);
  const [categories, setCategories] = useState(initial.categories);
  const [resetCount, setResetCount] = useState(0);
  const [busy, setBusy] = useState<"profile" | "colors" | "reset" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [confirmReset, setConfirmReset] = useState(false);

  const profileDirty =
    JSON.stringify(profile) !== JSON.stringify(initial.profile);
  const colorsDirty = JSON.stringify(colors) !== JSON.stringify(initial.colors);
  const lowContrast = contrast(colors.title, colors.background) < 4.5;

  async function save(section: "profile" | "colors") {
    setBusy(section);
    setError(null);
    try {
      await callApi("/api/settings", {
        method: "PATCH",
        body: section === "profile" ? { profile } : { colors },
      });
      show({
        message:
          section === "profile"
            ? "Perfil salvo — vale para os próximos rascunhos."
            : "Cores salvas — prévias e exportações já usam as novas cores.",
      });
      setVersion((v) => v + 1);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setBusy(null);
    }
  }

  async function reset() {
    setBusy("reset");
    try {
      const res = await callApi<{ settings: AppSettingsData }>(
        "/api/settings/reset",
      );
      setProfile(res.settings.profile);
      setColors(res.settings.colors);
      setCategories(res.settings.categories);
      setResetCount((n) => n + 1);
      setConfirmReset(false);
      setVersion((v) => v + 1);
      show({ message: "Padrão de fábrica restaurado." });
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao restaurar.");
    } finally {
      setBusy(null);
    }
  }

  const setP = (patch: Partial<Profile>) =>
    setProfile((p) => ({ ...p, ...patch }));

  return (
    <>
      {error && (
        <p
          role="alert"
          className="m-0 rounded-xl bg-discard-soft px-4 py-3 text-sm text-discard"
        >
          {error}
        </p>
      )}

      <section aria-label="Perfil" className={card}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="m-0 text-base font-semibold">Perfil</h2>
          <button
            type="button"
            disabled={!profileDirty || busy !== null}
            onClick={() => void save("profile")}
            className={btnPrimary}
          >
            {busy === "profile" ? "Salvando…" : "Salvar perfil"}
          </button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="brand" className="text-[13px] font-semibold">
              Nome da marca
            </label>
            <input
              id="brand"
              maxLength={40}
              value={profile.brandName}
              onChange={(e) => setP({ brandName: e.target.value })}
              className={input}
            />
            <span className="text-xs text-muted">
              Aparece no topo de cada slide.
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="handle" className="text-[13px] font-semibold">
              Perfil (@)
            </label>
            <input
              id="handle"
              maxLength={41}
              value={profile.handle}
              onChange={(e) => setP({ handle: e.target.value })}
              className={input}
            />
            <span className="text-xs text-muted">
              Vai no CTA final: “Siga {profile.handle || "@perfil"}…”
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="network" className="text-[13px] font-semibold">
              Rede social
            </label>
            <select
              id="network"
              value={profile.network}
              onChange={(e) =>
                setP({ network: e.target.value as SocialNetwork })
              }
              className={input}
            >
              {Object.entries(SOCIAL_NETWORKS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted">
              Muda o texto do prompt e os rótulos. O formato (carrossel 4:5) e a
              exportação para o agendador são os mesmos.
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="niche" className="text-[13px] font-semibold">
              Tema / nicho
            </label>
            <input
              id="niche"
              maxLength={60}
              value={profile.niche}
              onChange={(e) => setP({ niche: e.target.value })}
              placeholder="Ex.: IA e Dados, Finanças pessoais, Saúde digital"
              className={input}
            />
            <span className="text-xs text-muted">
              Diz ao assistente sobre o que é o perfil. As notícias buscadas
              seguem as palavras do tema em Fontes.
            </span>
          </div>
        </div>
      </section>

      <section aria-label="Cores" className={card}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="m-0 text-base font-semibold">Cores do post</h2>
            <p className="m-0 text-[13px] text-muted">
              Fundo, superfície e textos valem para todas as categorias; o
              destaque muda por categoria.
            </p>
          </div>
          <button
            type="button"
            disabled={!colorsDirty || busy !== null}
            onClick={() => void save("colors")}
            className={btnPrimary}
          >
            {busy === "colors" ? "Salvando…" : "Salvar cores"}
          </button>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-5">
          {FIXED.map((f) => (
            <ColorField
              key={f.key}
              id={`c-${f.key}`}
              label={f.label}
              value={colors[f.key]}
              onChange={(v) => setColors((c) => ({ ...c, [f.key]: v }))}
            />
          ))}
        </div>
        {lowContrast && (
          <p className="m-0 mb-4 rounded-lg bg-warn-bg px-3 py-2 text-[13px] text-warn-ink">
            O título tem pouco contraste com o fundo (
            {contrast(colors.title, colors.background).toFixed(1)}:1) — o texto
            pode ficar difícil de ler.
          </p>
        )}

        <p className="m-0 text-xs text-muted">
          A cor de destaque e o rótulo de cada categoria ficam em Categorias,
          logo abaixo.
        </p>
      </section>

      <CategoriesEditor
        key={`cats-${resetCount}`}
        initial={categories}
        version={version}
        onSaved={(c) => {
          setCategories(c);
          setVersion((v) => v + 1);
          show({
            message:
              "Categorias salvas — valem para prévias, exportações e rodadas.",
          });
          startTransition(() => router.refresh());
        }}
      />

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setConfirmReset(true)}
          className={btnSecondary}
        >
          Restaurar padrão de fábrica
        </button>
      </div>

      <Dialog
        open={confirmReset}
        role="alertdialog"
        maxWidth={480}
        onClose={() => setConfirmReset(false)}
        title="Restaurar o padrão de fábrica?"
        description="Perfil, cores, palavras-chave e fontes voltam ao que está em config/. Rascunhos e Memória não mudam."
        footer={
          <>
            <button
              type="button"
              data-autofocus
              onClick={() => setConfirmReset(false)}
              className={btnSecondary}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={busy === "reset"}
              onClick={() => void reset()}
              className={btnDanger}
            >
              {busy === "reset" ? "Restaurando…" : "Restaurar"}
            </button>
          </>
        }
      />
      <Toast toast={toast} onClose={hide} />
    </>
  );
}
