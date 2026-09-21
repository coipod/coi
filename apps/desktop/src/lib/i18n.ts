import nativeEn from "../locales/native-en.json" with { type: "json" };
import nativeJa from "../locales/native-ja.json" with { type: "json" };
import { create } from "zustand";
import en from "../locales/en.json" with { type: "json" };
import ja from "../locales/ja.json" with { type: "json" };
export type Locale = "en" | "ja";
export const supportedLocales = ["en", "ja"] as const;
export const normalizeLocale = (value: unknown): Locale =>
  value === "ja" ? "ja" : "en";
const storageKey = "coi.locale";
function savedLocale(): Locale {
  try {
    return normalizeLocale(localStorage.getItem(storageKey));
  } catch {
    return "en";
  }
}
export const useLocale = create<{
  locale: Locale;
  setLocale: (value: Locale) => void;
}>((set) => ({
  locale: savedLocale(),
  setLocale: (value) => {
    const locale = normalizeLocale(value);
    try {
      localStorage.setItem(storageKey, locale);
    } catch {
      /* Session-only preference when storage is unavailable. */
    }
    set({ locale });
  },
}));
export function t(key: string, values: unknown[] = []): string {
  const catalog: Record<string, string> =
    useLocale.getState().locale === "ja" ? ja : en;
  const source = catalog[key] ?? (en as Record<string, string>)[key] ?? key;
  return source.replace(/\{(\d+)\}/g, (match, index) =>
    index < values.length ? String(values[index]) : match,
  );
}

// Only use for application-owned messages, never user prompts, source files or model output.
export function systemText(value: string): string {
  const active: Record<string, string> =
    useLocale.getState().locale === "ja" ? ja : en;
  for (const key of Object.keys(en)) {
    if (
      value === key ||
      value === (en as Record<string, string>)[key] ||
      value === (ja as Record<string, string>)[key]
    )
      return active[key];
  }
  for (const [key, english] of Object.entries(nativeEn)) {
    const japanese = (nativeJa as Record<string, string>)[key];
    const target = useLocale.getState().locale === "ja" ? japanese : english;
    for (const source of [key, english, japanese]) {
      if (value === source) return target;
      if (!source.includes("{")) continue;
      const placeholders: string[] = [];
      let count = 0;
      const pattern = source
        .split(/(\{[^}]*\})/g)
        .map((part) => {
          if (/^\{[^}]*\}$/.test(part)) {
            placeholders.push(
              part === "{}" ? String(count++) : part.slice(1, -1),
            );
            return "([\\s\\S]*?)";
          }
          return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        })
        .join("");
      const match = value.match(new RegExp(`^${pattern}$`));
      if (!match) continue;
      const values = Object.fromEntries(
        placeholders.map((name, index) => [name, match[index + 1]]),
      );
      count = 0;
      return target.replace(
        /\{([^}]*)\}/g,
        (_token, name) => values[name || String(count++)] ?? "",
      );
    }
  }
  return value;
}

export function demoText(value: string): string {
  // Demo replies are app-authored; real model replies are never passed here.
  let result = value;
  for (const key of Object.keys(en)
    .filter((key) => key.length > 25)
    .sort((a, b) => b.length - a.length)) {
    for (const source of [
      key,
      (en as Record<string, string>)[key],
      (ja as Record<string, string>)[key],
    ]) {
      if (source && result.includes(source))
        result = result.split(source).join(t(key));
    }
  }
  return result;
}
