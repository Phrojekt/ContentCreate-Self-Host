import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  resolveSettings,
  settingsSchema,
  type AppSettingsData,
  type AppSettingsPatch,
} from "@/lib/settings-schema";

const ID = "default";

/**
 * Configuração efetiva (DEC-027): o que foi salvo pela UI sobre o padrão de
 * `config/`. Fail-safe — qualquer erro de banco devolve o padrão (a esteira e
 * as telas nunca caem por causa disso).
 */
export async function getEffectiveSettings(): Promise<AppSettingsData> {
  try {
    const row = await prisma.appSettings.findUnique({ where: { id: ID } });
    if (!row) return resolveSettings(null);
    return resolveSettings(JSON.parse(row.data) as unknown);
  } catch (err) {
    logger.warn(
      { err },
      "Configurações indisponíveis — usando o padrão de config/",
    );
    return resolveSettings(null);
  }
}

/** Salva seções (merge sobre a configuração efetiva) e devolve o resultado. */
export async function saveSettings(
  patch: AppSettingsPatch,
): Promise<AppSettingsData> {
  const current = await getEffectiveSettings();
  const next = settingsSchema.parse({ ...current, ...patch });
  await prisma.appSettings.upsert({
    where: { id: ID },
    create: { id: ID, data: JSON.stringify(next) },
    update: { data: JSON.stringify(next) },
  });
  return next;
}

/** "Restaurar padrão": apaga o registro — volta a valer `config/`. */
export async function resetSettings(): Promise<AppSettingsData> {
  await prisma.appSettings.deleteMany({ where: { id: ID } });
  return resolveSettings(null);
}
