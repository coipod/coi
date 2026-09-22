# Progressive dialogue display

New installations default to Normal dialogue speed. Existing saved Instant/Normal/Slow choices remain valid; the same preference controls COI scripts and live response presentation. OS or application reduced motion exposes all received text immediately.

COI scripts reveal grapheme clusters (including Japanese combining characters and emoji). Live response chunks append without replaying the prefix and catch up faster when a large chunk arrives. Show immediately finishes the current script/response, including subsequent chunks of that response. Completed history mounts immediately; cancellation, failure and approval states do not wait for the display queue. Markdown still uses the restricted renderer, and received text remains intact in persistence. Display frames never write progress into the application store.

The display animation operates **after** provider parsing and secret filtering. Codex/Antigravity line buffering and the native event polling interval are unchanged: this change does not promise token-by-token delivery from providers that withhold a line or return their result in one chunk. Do not bypass the split-secret safeguards to simulate earlier delivery.

Coverage: Unicode segmentation, appended chunks, final Markdown/code fences, history restoration, show-all, cancellation, timer cleanup, English/Japanese progressive display, and OS reduced motion. Existing onboarding, approval, apply/undo and sticker regression suites also apply.
