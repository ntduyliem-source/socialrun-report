# SocialRun Report

Buildless HTML/CSS/JavaScript for a public, read-only mobile report. The main
SocialRun repository, database and diagnostics stay private.

## Hosting

Deploy only these files to the dedicated public report repo's `main` branch:
`index.html`, `app.js`, `model.js`, `style.css`, `icon.svg`, `config.json`,
`.socialrun-report.json`, `.nojekyll`, `robots.txt`. Enable GitHub Pages from
`main:/`. No dependencies or build step are needed.

The `data` branch contains only `report.json`. `config.json` points the viewer
at the raw public JSON on that branch. Data commits do not trigger Pages builds.
Never copy the application checkout, runtime directory, jobs or workspace JSON
into this public repository. The marker must identify the dedicated report repo.

## Automatic data updates

`backend/app/public_report.py` runs with the SocialRun API. It reads a consistent
SQLite snapshot and exports explicitly allowed fields: employee/Page display
names, task times and states, quantities, device type, validated receipt summaries,
and confirmed Facebook post links. It does not serialize job/config/snapshot
dictionaries, free-form errors, follower names, secrets, media or diagnostics.

GitHub CLI uses the existing Windows credential store. No token is embedded in
the site, database or Git command arguments. Enable through local
`PUT /api/reports/online` with `{ "enabled": true, "repository": "owner/report" }`
and the dashboard client header. The target must be public and have the marker.
The data branch/file must already exist. The data publisher retries a failed sync
after a minute; it never retries a Facebook action. Disable in dashboard Settings.

For an older API that cannot be interrupted, start
`python scripts/publish_online_report.py --watch --enable --repository owner/report`
as a hidden background process. This uses the same exporter/config. A file lease
prevents overlapping writers, and the helper exits once a new API's publisher is
available. The helper reports API availability separately from its own heartbeat.

Changed results upload at most once a minute; unchanged snapshots get a heartbeat
every five minutes. The site polls every 30 seconds and reports the original
generation time; raw GitHub caching can delay visibility by several minutes.
After 15 minutes without a heartbeat it says updates have stopped. The last good
report remains viewable when the local machine/API is off.

Days refer to the schedule's work date, including tasks crossing Vietnam
midnight. The default display timezone is Vietnam; Halifax is also available.
All rows for the selected day remain visible; filters never paginate the list.
GitHub Pages and the report repository are public even though search indexing
is discouraged. There is no login or access-code protection.

## Validation

`node --test report-site/test/*.test.mjs` checks progress and filter calculations.
Backend tests cover credential omission, receipts, sampled invitations, publication
history, retry/restart, and enabling/disabling. Local browser QA should check a
375px phone viewport, date/timezone/employee/status filters, details and post links.
