import { afterEach, describe, expect, it } from "vitest";
import en from "../locales/en.json";
import ja from "../locales/ja.json";
import ko from "../locales/ko.json";
import nativeEn from "../locales/native-en.json";
import nativeJa from "../locales/native-ja.json";
import nativeKo from "../locales/native-ko.json";
import { normalizeLocale, supportedLocales, t, useLocale } from "./i18n";
import { stickers } from "./stickers";
import { presetLabels } from "./execution";
afterEach(() => useLocale.setState({ locale: "en" }));
describe("public locales", () => {
  it("only exposes English and Japanese and defaults unsupported preferences to English", () => {
    expect(supportedLocales).toEqual(["en", "ja"]);
    for (const value of [undefined, null, "ko", "fr", "ja-JP"]) expect(normalizeLocale(value)).toBe("en");
    expect(normalizeLocale("ja")).toBe("ja");
  });
  it("preserves Korean source and translates every UI/native entry with matching placeholders", () => {
    for (const [source, english, japanese] of [[ko, en, ja], [nativeKo, nativeEn, nativeJa]]) {
      expect(Object.keys(english).sort()).toEqual(Object.keys(source).sort());
      expect(Object.keys(japanese).sort()).toEqual(Object.keys(source).sort());
      for (const [key, original] of Object.entries(source)) {
        expect(original).toBe(key);
        for (const catalog of [english, japanese]) {
          const translated = (catalog as Record<string,string>)[key];
          expect(translated).not.toMatch(/[가-힣]/);
          expect(translated.match(/\{[^}]*\}/g)?.sort() ?? []).toEqual(key.match(/\{[^}]*\}/g)?.sort() ?? []);
        }
      }
    }
  });
  it("updates module catalogs without reload and interpolates values without translating them", () => {
    expect(stickers[0].label).toBe("Explain");
    useLocale.setState({ locale: "ja" });
    expect(stickers[0].label).toBe("説明して");
    expect(stickers[0].prompt).toContain("現在の作業");
    expect(presetLabels.performance).toBe("高性能");
    expect(t("{0} 변경안 준비", ["사용자 파일"])).toBe("사용자 파일 の変更案を準備しました");
  });
});
