import { t } from "./i18n";
export type ProviderId = "codex" | "claude" | "antigravity";
export type Preset = "performance" | "balanced" | "economy";
export interface ModelCapability {
  id: string;
  label: string;
  efforts: string[];
  defaultEffort: string;
}
export interface ProviderCapabilities {
  provider: ProviderId;
  models: ModelCapability[];
  presets: Partial<Record<Preset, { model: string; effort: string }>>;
}
export interface ExecutionSettings {
  provider: ProviderId;
  model: string;
  effort: string;
  advanced: boolean;
  conversationKey: string;
  transferHistory: boolean;
}
export const defaultExecution: ExecutionSettings = {
  provider: "codex",
  model: "",
  effort: "",
  advanced: false,
  conversationKey: "initial",
  transferHistory: false,
};
export const presetLabels: Record<Preset, string> = {
  get performance() {
    return t("고성능");
  },
  get balanced() {
    return t("비용효율");
  },
  get economy() {
    return t("절약");
  },
};
export function matchingPreset(
  settings: ExecutionSettings,
  capabilities?: ProviderCapabilities,
): Preset | undefined {
  if (capabilities?.provider !== settings.provider) return undefined;
  return (Object.keys(presetLabels) as Preset[]).find((preset) => {
    const choice = capabilities.presets[preset];
    return (
      choice?.model === settings.model && choice.effort === settings.effort
    );
  });
}
export function validExecution(
  settings: ExecutionSettings,
  capabilities?: ProviderCapabilities,
): boolean {
  const model =
    capabilities?.provider === settings.provider &&
    capabilities.models.find((model) => model.id === settings.model);
  return (
    !!model &&
    (model.efforts.length
      ? model.efforts.includes(settings.effort)
      : settings.effort === "")
  );
}
