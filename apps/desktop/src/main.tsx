import { t } from "./lib/i18n";
import React, { useEffect } from "react";
import { useLocale } from "./lib/i18n";
import { invoke, isTauri } from "@tauri-apps/api/core";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
class Boundary extends React.Component<
  { children: React.ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <main className="boot">
        <h1>{t("작업실을 다시 열어 주세요.")}</h1>
        <p>{t("화면을 표시하지 못했어요. 저장된 파일은 지우지 않았어요.")}</p>
        <button onClick={() => location.reload()}>{t("다시 열기")}</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
function LocalizedApp() {
  const locale = useLocale((state) => state.locale);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title =
      locale === "ja"
        ? "COI — 一緒に作る作業室"
        : "COI — Your coding workspace";
    if (isTauri()) void invoke("set_locale", { locale }).catch(console.error);
  }, [locale]);
  return (
    <Boundary>
      <App />
    </Boundary>
  );
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LocalizedApp />
  </React.StrictMode>,
);
