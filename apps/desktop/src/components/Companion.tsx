import { t, useLocale } from "../lib/i18n";
import { CharacterRig } from "./CharacterRig";
import { useState } from "react";
import { useReducedMotion } from "../hooks/motion";
import { useRevealedText } from "../hooks/revealedText";
import { useApp } from "../stores/app";
import {
  isTerminal,
  expressionFor,
  type Expression,
  type RunState,
} from "@coi/protocol";
const positions: Record<Expression, [number, number]> = {
  neutral: [0, 0],
  greeting: [1, 0],
  thinking: [2, 0],
  working: [3, 0],
  question: [0, 1],
  success: [1, 1],
  concerned: [2, 1],
};
export function Sprite({
  expression = "neutral",
  className = "",
}: {
  expression?: Expression;
  className?: string;
}) {
  const [x, y] = positions[expression];
  return (
    <div
      role="img"
      aria-label={`COI · ${expression}`}
      className={`sprite ${className}`}
      style={{ backgroundPosition: `${(x * 100) / 3}% ${y * 100}%` }}
    />
  );
}
export function dialogue(run?: RunState) {
  if (!run) return t("작은 아이디어도 좋아요.\n무엇부터 같이 만들어 볼까요?");
  if (run.pending.length)
    return t("작업할 범위를 확인해 주세요.\n준비되면 사본에서 시작할게요.");
  if (run.status === "cancelled")
    return t("여기서 멈췄어요.\n원본에는 아무것도 적용하지 않았어요.");
  if (run.verification === "failed")
    return t("검증에서 문제가 발견됐어요.\n결과를 함께 확인해 주세요.");
  if (run.status === "failed")
    return t("작업이 중단됐어요.\n안내를 확인하고 다시 시작할 수 있어요.");
  if (run.status === "completed")
    return run.events.some((e) => e.kind === "artifact_created")
      ? t("변경안을 준비했어요.\n차이를 확인하고 다음을 결정해 주세요.")
      : t("분석을 마쳤어요.\n제안과 검증 여부를 확인해 주세요.");
  if (run.activity === "editing")
    return t("작업 사본을 다듬고 있어요.\n원본은 그대로 유지돼요.");
  if (run.activity === "command") return t("실행 결과를 확인하고 있어요.");
  return t("관련 내용을 살펴보고 있어요.\n조금씩 함께 풀어 볼게요.");
}
export function Companion({
  run,
  onStart,
}: {
  run?: RunState;
  onStart: () => void;
}) {
  const textSpeed = useApp((s) => s.settings.textSpeed);
  const sessionId = useApp((s) => s.activeId);
  const locale = useLocale((s) => s.locale);
  const reducedMotion = useReducedMotion();
  const text = dialogue(run);
  const [restored] = useState(() =>
    run && isTerminal(run.status) ? run.runId : undefined,
  );
  const { displayed, revealing, revealAll } = useRevealedText(
    text,
    `${sessionId}:${locale}:${run?.runId ?? "welcome"}:${text}`,
    {
      instant:
        reducedMotion ||
        textSpeed === "instant" ||
        (restored === run?.runId && !!run) ||
        (!!run &&
          (run.pending.length > 0 ||
            run.status === "cancelled" ||
            run.status === "failed")),
      slow: textSpeed === "slow",
    },
  );
  return (
    <div className="companion">
      <div className="companion-eyebrow">
        <span className="live-dot" /> YOUR CODING COMPANION
      </div>
      <div className="character-stage">
        <div className="orbit orbit-one" />
        <div className="orbit orbit-two" />
        <span className="stage-code code-one">&lt;/&gt;</span>
        <span className="stage-code code-two">✧</span>
        <CharacterRig
          expression={expressionFor(run)}
          reducedMotion={reducedMotion}
          fallback={<Sprite expression={expressionFor(run)} />}
        />
        <div className="character-caption">
          <span>COI</span>
          <small>Coding Organizing Intelligence</small>
        </div>
      </div>
      <div className="dialogue">
        <span className="dialogue-name">
          COI <span>{t("코이")}</span>
        </span>
        <p aria-live="polite" aria-label={text}>
          <span aria-hidden="true">{displayed}</span>
        </p>
        {revealing && (
          <button className="text-button" onClick={revealAll}>
            {t("바로 표시")}
          </button>
        )}
        <span className="dialogue-corner">✦</span>
      </div>
      <div className="companion-footer">
        <span className="tiny-label">OUR WORKSPACE</span>
        <p>{t("당신의 속도로, 함께 만들어요.")}</p>
        <button className="text-button" onClick={onStart}>
          {t("프로젝트 열기")}
          <span>↗</span>
        </button>
      </div>
    </div>
  );
}
