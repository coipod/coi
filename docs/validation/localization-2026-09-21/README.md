# English / Japanese UI · 2026-09-21

English is the default. Only English and 日本語 appear in the language selector on onboarding and Settings → Appearance & accessibility. The selection is saved in the local WebView/browser storage (`coi.locale`). Unsupported values, including `ko`, fall back to English. Changing language does not remount the app or reset drafts.

Korean is preserved in `apps/desktop/src/locales/ko.json` and `native-ko.json`, alongside source keys. These catalogs are not offered as a supported UI locale. App-authored text, accessibility labels, stickers, prompts, native setup messages, scope dialogs and window titles use English/Japanese. User conversations, names, source files and real model output are not translated or deleted. Old app-authored demo responses are translated for display only.

The Windows installer language list is English/Japanese with English first; Windows execution was not tested.

## Validation
- TypeScript, ESLint, 19 unit tests passed, including catalog parity and placeholder preservation.
- 45 Rust tests passed; 5 live authenticated/network tests remain explicitly ignored.
- 27 related E2E tests passed across localization (5), stickers (9) and workspace (13) runs.
- Both languages checked at 960, 1440 and 1728px. Screenshot capture waits for panel transitions to complete.
- English default, hidden Korean locale, Japanese switching/reload, draft/sticker preservation and preservation of user-authored Korean text tested.
- macOS debug build succeeded. Finder launch confirmed English UI; native settings expose only English/日本語; Japanese switches the UI and window title. Returned app to English afterward.
- Existing large-chunk Vite warning remains; this is a local debug bundle, not a signed/notarized release.
