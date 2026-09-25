# Launch gates and ownership

D0 has not been scheduled. The owner is the publication/contact owner; the implementing engineer prepares artifacts and records technical evidence. Volunteering testers perform user acceptance themselves.

| Gate | Status | Required evidence |
|---|---|---|
| Publishable conduct/security contact | Complete locally, 2026-09-22 | Owner-approved coipoddev@gmail.com; SECURITY / CODE_OF_CONDUCT updated |
| Public transition | Not authorized by this kit | Separate owner approval, then verification of public access |
| Final revision remote CI and clean clone | Pending latest UI changes | Commit SHA, matching green run and clean-clone log |
| Source, asset, screenshot and secret review | Pending final revision | Existing release checklist completed |
| Repository protection / private reporting | Pending release setup | Verified enforcement and reporting link after public transition |
| Three first-time users | Not started | 3 independent records in acceptance.csv; at least one EN and one JA |
| Real CLI recording | Not recorded | Raw recording, actual provider/version, result and consent-safe project |
| 15s/60s EN/JA video | Draft subtitles only | Four reviewed exports matched to raw recording |
| Current UI screenshots | Prepared separately | Manifest hashes and visual review; browser preview label retained |
| Maker accounts and community eligibility | Owner action pending | Account URLs, current rules reviewed before publication |

Keep the repository private until existing release conditions in ../release/READINESS.md are met. Do not infer a reporting email from Git metadata. Do not remove private-access wording prematurely.

## First-use acceptance

Recruit three willing first-time users through ordinary relevant conversations; no unsolicited bulk messages. At least one reads English instructions and one Japanese. Each uses their own supported Mac and provider account, knows provider usage may cost money, and follows the README without hidden setup help.

Observe source build, CLI connection, first read-only request, copy editing, diff review, apply and undo in a disposable project. Record step, elapsed time, error and any assistance. Never collect credentials or raw private logs. A tester needing help is not an unassisted success: fix the instructions and repeat the failed step with a fresh tester if needed. Collect permission separately before quoting a user or publishing their screenshot. Do not invent testimonials.

## Community review

Check X, Reddit and Zenn rules and account requirements on publication day. Reddit's SideProject rules could not be fully retrieved during preparation, so eligibility is unconfirmed: https://www.reddit.com/r/SideProject/about/rules . Do not repost around moderation.

Show HN is conditional on a runnable project and maker availability. The maker must independently write the submission and comments; do not paste or paraphrase this kit into HN. HN prohibits generated/AI-edited text and vote solicitation. Do not ask friends to vote. References checked 2026-09-22: https://news.ycombinator.com/showhn.html and https://news.ycombinator.com/newsguidelines.html . If not ready by week 6, omit HN and use the scheduled ordinary X update.
