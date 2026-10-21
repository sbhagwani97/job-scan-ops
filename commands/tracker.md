---
description: Show or update the job tracker (list, show, set status, re-render)
argument-hint: [list [--status S] [--min-score N]] | show <id> | set <id> <status> [note] | render
allowed-tools: Read, Bash
---

Manage the tracker in `job-scan/`. Arguments: `$ARGUMENTS`. Plugin root: `${CLAUDE_PLUGIN_ROOT}` (if empty, locate `scripts/tracker.mjs` with Glob).

Map the arguments to the script (run from the project directory):
- empty or `list ...` -> `node "<root>/scripts/tracker.mjs" list [--status S] [--min-score N]`; present the result as a compact table and summarize counts per status.
- `show <id>` -> `node "<root>/scripts/tracker.mjs" show <id>`; summarize the job, score, rationale, matches, gaps and link (omit the full description).
- `set <id> <status> [note...]` -> `node "<root>/scripts/tracker.mjs" set-status <id> <status> [--note "<note>"]`. Valid statuses: Shortlisted, Prepared, Applied, Interview, Offer, Rejected, Skipped, Closed.
- `render` -> `node "<root>/scripts/tracker.mjs" render`.

If `job-scan/tracker.json` does not exist, tell the user to run `/job-scan:setup`. Tell the user that `job-scan/tracker.md` is generated and should be changed via this command, not by hand.
