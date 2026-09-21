import { t } from "./i18n";
export const stickers = [
  {
    id: "explain",
    get label() {
      return t("설명해줘");
    },
    get prompt() {
      return t(
        "현재 작업 내용을 처음 보는 사람도 이해할 수 있게 쉽게 설명해줘.",
      );
    },
  },
  {
    id: "find",
    get label() {
      return t("문제 찾아줘");
    },
    get prompt() {
      return t("현재 작업에서 문제와 개선할 부분을 찾아 중요도 순서로 알려줘.");
    },
  },
  {
    id: "fix",
    get label() {
      return t("고쳐줘");
    },
    get prompt() {
      return t("앞서 이야기한 문제를 고치고, 변경 내용과 확인 결과를 알려줘.");
    },
  },
  {
    id: "create",
    get label() {
      return t("만들어줘");
    },
    get prompt() {
      return t(
        "만들고 싶은 기능을 함께 구체화해줘. 필요한 정보가 부족하면 먼저 질문해줘.",
      );
    },
  },
  {
    id: "check",
    get label() {
      return t("검사해줘");
    },
    get prompt() {
      return t(
        "현재 변경 사항을 검사하고, 확인한 결과와 아직 확인하지 못한 부분을 구분해줘.",
      );
    },
  },
  {
    id: "summarize",
    get label() {
      return t("정리해줘");
    },
    get prompt() {
      return t("지금까지의 작업과 결정 사항, 남은 일을 간결하게 정리해줘.");
    },
  },
] as const;
export type StickerId = (typeof stickers)[number]["id"];
export function getSticker(id?: string) {
  return stickers.find((sticker) => sticker.id === id);
}
export function insertStickerPrompt(
  text: string,
  cursor: number,
  prompt: string,
) {
  const index = Math.max(0, Math.min(text.length, cursor));
  const before = text.slice(0, index),
    after = text.slice(index);
  const addition = `${before && !/\s$/.test(before) ? "\n" : ""}${prompt}${after && !/^\s/.test(after) ? "\n" : ""}`;
  return { text: before + addition + after, cursor: index + addition.length };
}
