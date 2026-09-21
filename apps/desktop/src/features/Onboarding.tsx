import { LanguageSelect } from "../components/LanguageSelect";
import { t } from "../lib/i18n";
import {
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Command,
  Check,
  ChevronRight,
} from "lucide-react";
import { useApp, type Stage } from "../stores/app";
import { Sprite } from "../components/Companion";

const stageIndex: Record<Stage, number> = {
  introduction: 0,
  provider_check: 1,
  trust_pact: 2,
  first_mission: 3,
  guided_run: 3,
  completed: 4,
};
export function Onboarding() {
  const chapters = [
    t("첫 만남"),
    t("도구 확인"),
    t("작업 약속"),
    t("첫 임무"),
    t("준비 완료"),
  ];
  const s = useApp();
  const n = stageIndex[s.stage];
  const go = (stage: Stage) => s.setStage(stage);
  return (
    <main className="onboarding">
      <header className="onboarding-top">
        <a className="brand" href="#" onClick={(e) => e.preventDefault()}>
          <img
            className="brand-icon"
            src="/coi/sd/app-icon.png"
            alt="COI"
            width="31"
            height="31"
          />
          coi
          <span className="alpha-label">ALPHA</span>
        </a>
        <div>
          <LanguageSelect />
          <label className="motion-toggle">
            <input
              type="checkbox"
              checked={s.settings.reducedMotion}
              onChange={(e) =>
                s.updateSettings({ reducedMotion: e.target.checked })
              }
            />{" "}
            {t("움직임 줄이기")}
          </label>
          <button className="text-button" onClick={s.skip}>
            {t("나중에 둘러보기")}
            <ChevronRight size={15} />
          </button>
        </div>
      </header>
      {s.persistError && (
        <div className="error-banner" role="alert">
          {s.persistError}
        </div>
      )}
      <div className="onboarding-body">
        <div className="intro-art">
          <span className="intro-tag">A LITTLE CODE. A LITTLE COMPANY.</span>
          <div className="intro-circle" />
          <Sprite
            expression={
              n === 0
                ? "greeting"
                : n === 2
                  ? "question"
                  : n === 3
                    ? "thinking"
                    : "neutral"
            }
          />
          <span className="intro-art-name">
            COI<span>{t("코딩의 모든 순간, 곁에서.")}</span>
          </span>
        </div>
        <section className="intro-content">
          <ol className="chapters" aria-label={t("온보딩 진행")}>
            {chapters.map((c, i) => (
              <li key={c} className={i === n ? "current" : i < n ? "done" : ""}>
                <span>{i < n ? <Check size={10} /> : i + 1}</span>
                <small>{c}</small>
              </li>
            ))}
          </ol>
          <div className="chapter-number">CHAPTER 0{n + 1}</div>
          {n === 0 ? (
            <>
              <h1>
                {t("반가워요.")}
                <br />
                {t("저는")}
                <em>COI</em>
                {t("예요.")}
              </h1>
              <p className="intro-copy">
                {t("아이디어가 코드가 되는 순간까지,")}
                <br />
                {t("복잡한 도구 사이에서 당신과 함께할게요.")}
              </p>
              <p className="subtle">
                {t("작업은 차근차근 정리하고,")}
                <br />
                {t("중요한 결정은 꼭 먼저 여쭤볼게요.")}
              </p>
              <label className="field-label" htmlFor="nickname">
                {t("어떻게 불러 드릴까요?")}
                <span>{t("선택")}</span>
              </label>
              <input
                id="nickname"
                className="text-input"
                placeholder={t("편하게 부를 이름")}
                value={s.settings.displayName}
                onChange={(e) =>
                  s.updateSettings({ displayName: e.target.value.slice(0, 30) })
                }
              />
              <button
                className="primary intro-next"
                onClick={() => go("provider_check")}
              >
                {t("반가워, COI")}
                <ArrowRight size={17} />
              </button>
              <small className="footnote">
                {t("가입 없이 시작해요 · 약 5분의 짧은 만남")}
              </small>
            </>
          ) : n === 1 ? (
            <>
              <h1>
                {t("함께 쓸 도구를")}
                <br />
                {t("알아볼까요?")}
              </h1>
              <p className="intro-copy">
                {t("COI 계정은 필요 없어요. 실제 작업에는")}
                <br />
                {t("공식 CLI에 인증한 내 AI 계정을 사용해요.")}
              </p>
              <div className="provider-check-list">
                {s.detections.map((d) => (
                  <button
                    key={d.provider}
                    onClick={() => s.setGuide(d.provider)}
                  >
                    <span className={`provider-icon ${d.provider}`}>
                      {d.provider === "codex"
                        ? "C"
                        : d.provider === "claude"
                          ? "✳"
                          : d.provider === "antigravity"
                            ? "A"
                            : "✦"}
                    </span>
                    <span>
                      <b>
                        {d.provider === "claude"
                          ? "Claude Code"
                          : d.provider === "antigravity"
                            ? "Antigravity CLI"
                            : d.provider === "gemini"
                              ? "Gemini CLI"
                              : "Codex"}
                      </b>
                      <small>
                        {d.version ?? t("설치 안내 보기")} ·{" "}
                        {d.compatibility === "missing"
                          ? t("미설치")
                          : t("실행 검증 필요")}
                      </small>
                    </span>
                    <ChevronRight size={16} />
                  </button>
                ))}
              </div>
              <button
                className="primary intro-next"
                onClick={() => go("trust_pact")}
              >
                {t("먼저 체험해 볼게")}
                <ArrowRight size={17} />
              </button>
              <button
                className="text-button"
                onClick={() => void s.detect()}
                disabled={s.detecting}
              >
                {s.detecting ? t("도구 확인 중…") : t("설치 후 다시 확인")}
              </button>
            </>
          ) : n === 2 ? (
            <>
              <h1>
                {t("시작하기 전에,")}
                <br />
                {t("작은 약속 하나.")}
              </h1>
              <p className="intro-copy">
                {t("작업 사본에서 먼저 수정할게요.")}
                <br />
                {t("원본은 변경안을 확인한 뒤에 적용해요.")}
              </p>
              <div className="pact">
                <ShieldCheck />
                <div>
                  <b>{t("내 파일의 마지막 결정은 내가")}</b>
                  <p>
                    {t(
                      "원본 적용은 별도 승인이 필요해요. 원본이 달라졌다면 덮어쓰지 않고 멈춰요.",
                    )}
                  </p>
                </div>
              </div>
              <div className="pact">
                <Command />
                <div>
                  <b>{t("로컬 저장, 명확한 AI 사용")}</b>
                  <p>
                    {t(
                      "실제 실행 시 CLI가 코드와 요청을 AI 공급자에 전송할 수 있고 사용량이 발생해요. Demo는 파일·CLI·네트워크를 사용하지 않아요.",
                    )}
                  </p>
                </div>
              </div>
              <div className="choice-row">
                <button
                  className={
                    s.settings.mode === "review_copy"
                      ? "choice selected"
                      : "choice"
                  }
                  onClick={() => s.updateSettings({ mode: "review_copy" })}
                >
                  {t("사본에서 작업")}
                  <small>{t("변경 후 검토")}</small>
                </button>
                <button
                  className={
                    s.settings.mode === "plan" ? "choice selected" : "choice"
                  }
                  onClick={() => s.updateSettings({ mode: "plan" })}
                >
                  {t("읽기만")}
                  <small>{t("분석과 제안")}</small>
                </button>
              </div>
              <button
                className="primary intro-next"
                onClick={() => go("first_mission")}
              >
                {t("약속 확인했어")}
                <ArrowRight size={17} />
              </button>
            </>
          ) : (
            <>
              <h1>
                {t("첫 이야기는,")}
                <br />
                {t("작은 인사부터.")}
              </h1>
              <p className="intro-copy">
                {t("예제 README의 인사말을 다듬으며")}
                <br />
                {t("작업과 변경 검토를 함께 경험해 봐요.")}
              </p>
              <div className="mission-preview">
                <span className="tag">{t("DEMO · 모의 예제")}</span>
                <p>{t("“인사말을 더 친근하게 바꿔줘”")}</p>
                <code>
                  README.md <span>{t("한 번의 작은 변화")}</span>
                </code>
              </div>
              <button
                className="primary intro-next"
                onClick={() => {
                  s.setStage("guided_run");
                  s.skip();
                  s.newSession();
                  s.updateSettings({ mode: "review_copy" });
                  void s.send(t("인사말을 더 친근하게 바꿔줘"));
                }}
              >
                {t("COI와 첫 작업 시작")}
                <ArrowRight size={17} />
              </button>
              <button className="text-button" onClick={() => go("completed")}>
                {t("작업실 먼저 둘러보기")}
              </button>
            </>
          )}
          {n > 0 && (
            <button
              className="intro-back text-button"
              onClick={() =>
                go(
                  (["introduction", "provider_check", "trust_pact"] as Stage[])[
                    n - 1
                  ],
                )
              }
            >
              <ArrowLeft size={14} /> {t("이전")}
            </button>
          )}
        </section>
      </div>
      <footer className="onboarding-bottom">
        <span>PRIVATE BY DESIGN</span>
        <span>{t("내 컴퓨터에 저장 · 계정 없음 · 오픈소스")}</span>
        <span>01 — A NEW BEGINNING</span>
      </footer>
    </main>
  );
}
