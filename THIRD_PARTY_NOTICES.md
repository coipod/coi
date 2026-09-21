# Third-party notices

COI source is greenfield. No competitor code was copied. Dependency licenses remain with their authors. Exact versions are recorded in package-lock.json and apps/desktop/src-tauri/Cargo.lock; generated inventories are in docs/release/.

| Component | Source | License | Use |
| --- | --- | --- | --- |
| React / React DOM | https://github.com/facebook/react | MIT | UI |
| Tauri | https://github.com/tauri-apps/tauri | MIT or Apache-2.0 | Desktop runtime |
| Vite / Vitest | https://github.com/vitejs | MIT | Build / tests |
| Zustand | https://github.com/pmndrs/zustand | MIT | UI state |
| Zod | https://github.com/colinhacks/zod | MIT | Event validation |
| Lucide | https://github.com/lucide-icons/lucide | ISC | UI icons, unmodified |
| react-markdown | https://github.com/remarkjs/react-markdown | MIT | Static Markdown |
| jsdiff | https://github.com/kpdecker/jsdiff | BSD-3-Clause | Text diff |
| cap-std | https://github.com/bytecodealliance/cap-std | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | Directory capabilities |
| rusqlite | https://github.com/rusqlite/rusqlite | MIT | SQLite bindings |
| rfd | https://github.com/PolyMeilex/rfd | MIT | Native folder picker |
| image | https://github.com/image-rs/image | MIT OR Apache-2.0 | Bounded image decoding and PNG re-encoding |
| git2 0.21.0 / libgit2-sys 0.18.8 | https://github.com/rust-lang/git2-rs | MIT OR Apache-2.0 | Read-only Git bindings; SSH/HTTPS features disabled |
| libgit2 1.9.7 | https://github.com/libgit2/libgit2/tree/v1.9.7 | GPL-2.0 with upstream linking exception; bundled subcomponents retain their notices | Vendored, unmodified, read-only status/diff |
| zlib / libz-sys | https://github.com/madler/zlib / https://github.com/rust-lang/libz-sys | Zlib / MIT OR Apache-2.0 bindings | libgit2 compression dependency |
| Playwright | https://github.com/microsoft/playwright | Apache-2.0 | Web E2E |

System fonts are used; no third-party font is embedded or fetched at runtime. PixiJS 8.21.0 (https://github.com/pixijs/pixijs) is MIT licensed and renders the complete-pose character mesh; its MIT notice is included under `apps/desktop/public/licenses/`.

The character atlas, SD illustrations, PNG favicon and platform icons are COI artwork under CC BY 4.0. Their source, owner declaration and attribution requirements are recorded in `assets/coi/README.md` and `manifest.json`. Icons are derived from `apps/desktop/public/coi/sd/app-icon.png`, not the obsolete SVG. Original reference documents and unused experimental parts are excluded. CLI executables are not bundled; separately installed provider CLIs retain their own terms.

Read-only implementation comparisons (no reuse): RunJam at `5f8e67ac2185bde763e40f7b4538e4d13b591912` and Desktop CC GUI at `b48675fae011a06c5336c550501fd183704ce5f6`. See docs/adr/000-product.md.

The unmodified libgit2 COPYING (including its linking exception and bundled component notices), AUTHORS, git2 MIT notice and zlib license are included under `apps/desktop/public/licenses/` and can be read in the app’s About settings. No libgit2 library source was modified.
