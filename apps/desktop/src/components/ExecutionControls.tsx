import { t } from "../lib/i18n";
import { useEffect, useState } from "react";
import { bridge } from "../lib/bridge";
import { installManifest } from "../lib/providers";
import {
  defaultExecution,
  matchingPreset,
  presetLabels,
  type Preset,
  type ProviderCapabilities,
  type ProviderId,
} from "../lib/execution";
import { useApp } from "../stores/app";

export function ExecutionControls() {
  const session = useApp((state) =>
    state.sessions.find((item) => item.id === state.activeId),
  );
  const update = useApp((state) => state.updateExecution);
  const settings = session?.execution ?? defaultExecution;
  const [capabilities, setCapabilities] = useState<ProviderCapabilities>();
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let disposed = false;
    setCapabilities(undefined);
    setError("");
    void bridge
      .capabilities(settings.provider)
      .then((result) => {
        if (disposed) return;
        setCapabilities(result);
        const current = useApp
          .getState()
          .sessions.find((item) => item.id === session?.id)?.execution;
        if (!current?.model && result.presets.balanced)
          update(result.presets.balanced);
      })
      .catch((reason) => {
        if (!disposed)
          setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      disposed = true;
    };
    // Effective settings are deliberately not reset when changing display modes.
  }, [settings.provider, session?.id, refresh, update]);
  const preset = matchingPreset(settings, capabilities);
  const model = capabilities?.models.find((item) => item.id === settings.model);
  return (
    <div className="execution-controls">
      <div className="execution-heading">
        <select
          aria-label={t("CLI 종류")}
          value={settings.provider}
          onChange={(event) =>
            update({
              provider: event.target.value as ProviderId,
              model: "",
              effort: "",
            })
          }
        >
          {installManifest.providers.map((provider) => (
            <option value={provider.id} key={provider.id}>
              {provider.name}
            </option>
          ))}
        </select>
        <label className="settings-switch">
          <span>{t("일반")}</span>
          <input
            type="checkbox"
            role="switch"
            aria-label={t("고급 설정")}
            checked={settings.advanced}
            onChange={(event) => update({ advanced: event.target.checked })}
          />
          <span>{t("고급")}</span>
        </label>
      </div>
      {settings.advanced ? (
        <div className="advanced-controls">
          <label>
            {t("모델")}
            <select
              aria-label={t("모델")}
              value={settings.model}
              disabled={!capabilities?.models.length}
              onChange={(event) => {
                const choice = capabilities?.models.find(
                  (item) => item.id === event.target.value,
                );
                if (choice)
                  update({ model: choice.id, effort: choice.defaultEffort });
              }}
            >
              <option value="" disabled>
                {t("연결 후 선택")}
              </option>
              {capabilities?.models.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Effort
            <select
              aria-label="Effort"
              value={settings.effort}
              disabled={!model?.efforts.length}
              onChange={(event) => update({ effort: event.target.value })}
            >
              {!model?.efforts.length && (
                <option value="">{t("지원하지 않음")}</option>
              )}
              {model?.efforts.map((effort) => (
                <option key={effort} value={effort}>
                  {effort}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <div className="preset-controls" aria-label={t("성능 설정")}>
          {(Object.keys(presetLabels) as Preset[]).map((key) => (
            <button
              type="button"
              key={key}
              aria-pressed={preset === key}
              disabled={!capabilities?.presets[key]}
              onClick={() => {
                const choice = capabilities?.presets[key];
                if (choice) update(choice);
              }}
            >
              {presetLabels[key]}
            </button>
          ))}
          {settings.model && !preset && <small>{t("사용자 설정")}</small>}
        </div>
      )}
      {!!session?.messages.length && (
        <label className="history-transfer">
          <input
            type="checkbox"
            checked={settings.transferHistory}
            onChange={(event) =>
              update({ transferHistory: event.target.checked })
            }
          />
          {t("다음 요청에 이전 대화 내용을 선택한 CLI로 전달")}
        </label>
      )}
      <small className="execution-summary">
        {settings.provider} · {settings.model || t("모델 확인 전")} ·{" "}
        {settings.effort || t("기본 추론")} {t("· 다음 요청에 적용")}
      </small>
      {error && (
        <div className="execution-error" aria-live="polite">
          {error}
          <button
            type="button"
            onClick={() => setRefresh((value) => value + 1)}
          >
            {t("다시 확인")}
          </button>
        </div>
      )}
    </div>
  );
}
