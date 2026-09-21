import { t } from "./i18n";
export const installManifest = {
  version: 1,
  docsCheckedAt: "2026-09-19",
  autoExecute: true,
  providers: [
    {
      id: "codex",
      name: "Codex",
      company: "OpenAI",
      monogram: "C",
      get description() {
        return t("첫 번째로 연결할 코딩 엔진");
      },
      docs: "https://learn.chatgpt.com/docs/codex/cli",
      authDocs: "https://learn.chatgpt.com/docs/auth",
      mac: "npm install -g @openai/codex",
      windows: "npm install -g @openai/codex",
      get prerequisite() {
        return t(
          "COI의 macOS 자동 설치에는 Node.js가 필요하지 않아요. 아래 npm 명령으로 직접 설치할 때만 Node.js와 npm을 준비해 주세요.",
        );
      },
      verify: "codex --version",
      auth: "codex login",
      get phase() {
        return t("공식 CLI 연결");
      },
    },
    {
      id: "claude",
      name: "Claude Code",
      company: "Anthropic",
      monogram: "✳",
      get description() {
        return t("공식 설치와 계정 연결을 지원해요");
      },
      docs: "https://code.claude.com/docs/en/quickstart",
      authDocs: "https://code.claude.com/docs/en/quickstart",
      mac: "curl -fsSL https://claude.ai/install.sh | bash",
      windows: "irm https://claude.ai/install.ps1 | iex",
      get prerequisite() {
        return t(
          "공식 네이티브 설치는 Node.js나 Homebrew 없이 사용할 수 있어요.",
        );
      },
      verify: "claude --version",
      auth: "claude",
      get phase() {
        return t("공식 CLI 연결");
      },
    },
    {
      id: "antigravity",
      name: "Antigravity CLI",
      company: "Google",
      monogram: "A",
      get description() {
        return t("Google Antigravity 에이전트 CLI를 연동해요");
      },
      docs: "https://antigravity.google/docs/cli/reference",
      authDocs: "https://antigravity.google/docs/cli/reference",
      mac: "curl -fsSL https://antigravity.google/cli/install.sh | bash",
      windows: "irm https://antigravity.google/cli/install.ps1 | iex",
      get prerequisite() {
        return t("공식 네이티브 설치 프로그램을 사용해요.");
      },
      verify: "agy --version",
      auth: "agy",
      get phase() {
        return t("공식 CLI 연결");
      },
    },
  ] as const,
};
