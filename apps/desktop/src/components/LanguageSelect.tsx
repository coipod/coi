import { useLocale, type Locale } from "../lib/i18n";
export function LanguageSelect() {
  const { locale, setLocale } = useLocale();
  return (
    <label className="language-select">
      <span>{locale === "ja" ? "表示言語" : "Language"}</span>
      <select
        aria-label={locale === "ja" ? "表示言語" : "Language"}
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
      >
        <option value="en">English</option>
        <option value="ja">日本語</option>
      </select>
    </label>
  );
}
