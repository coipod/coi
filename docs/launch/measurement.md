# Measurement without app telemetry

At public launch (D0), record actual stars and UTC date as week 0. The earlier private count is not the public baseline. Once a week, use GitHub repository insights/API for stars, traffic and clones, and native channel analytics for impressions. Record unavailable analytics as NA, not zero. Preserve the exact traffic date window; overlapping/rolling unique visitor counts must not be summed into a campaign total.

Use `gh repo view coipod/coi --json visibility,stargazerCount,url` for the current count. With repository permissions, `gh api repos/coipod/coi/traffic/views` and `gh api repos/coipod/coi/traffic/clones` expose traffic snapshots. These may be unavailable or empty; retain that limitation. Never publish raw personal profiles. A local weekly readiness/metrics check is active; see operations.md. It is not an external posting service.

metrics.csv holds weekly observations, content-log.csv identifies actual posts, acceptance.csv contains voluntary test evidence. Do not infer language or nationality from stargazer names. Language means the content or feedback language. Impressions across platforms are not necessarily comparable; no causal per-channel star conversion is claimed.

At week 4: below 40 stars, inspect the weakest funnel step. Low views: improve opening frame/topic. Views but few repository visits: clarify the value and destination. Visits but repeated setup failures: fix onboarding before increasing outreach. Keep both languages; adjust effort no further than 60:40 and record why. At week 8 record the actual result even if below 100. Do not substitute fake adoption metrics.
