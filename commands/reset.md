---
description: Review and update your CV and every preference one by one (keep as-is or modify)
argument-hint: [cv | roles | locations | requirements | sources | threshold]  (optional: only review these sections)
allowed-tools: Read, Write, Edit, Bash, Task, Glob, AskUserQuestion
---

Walk the user through their existing configuration and let them keep or change each item. Arguments: `$ARGUMENTS` (if given, only review the named sections; otherwise review all).

Plugin root: `${CLAUDE_PLUGIN_ROOT}` (if empty, locate `scripts/tracker.mjs` with Glob and use its parent's parent).

## Rules for the walkthrough
- Require `job-scan/profile.yml`. If it is missing, tell the user to run `/job-scan:setup` and stop.
- Read `job-scan/profile.yml` and `job-scan/cv/cv.profile.yml` first.
- Go through the items **one at a time**, never batching several items into one question. For each item, show the **current value** and ask with AskUserQuestion: options `Keep as is` (first, recommended) and `Modify`. The built-in "type your own answer" can also carry a new value directly.
- If they choose Modify, ask for the new value (for list items, accept a full replacement list, or "add X" / "remove Y"), echo the resulting value back, then move on.
- Do not write anything until the final confirmation step. Track changes in memory as `item: old -> new`.

## Items, in this order
1. **CV**: current file and headline from `cv.profile.yml`. If Modify, ask for the path to the new CV (PDF, md, txt or docx), then follow setup steps 2-5 for conversion and review: Read it, produce verbatim-structure markdown, show a preview, let the user fix things until they confirm, then regenerate `cv.profile.yml`. Do not overwrite the existing files until the new CV is confirmed. Then archive the old ones: move `cv/cv.md` to `cv/archive/cv-<YYYYMMDD-HHMM>.md` and `cv/cv.profile.yml` likewise, and copy the new original into `cv/original/`.
2. **Roles** (`roles`)
3. **Cities** (`filters.locations`)
4. **Countries** (`filters.countries`)
5. **Remote preference** (`filters.remote`: include / only / exclude) and, if remote is not excluded, **remote regions** (`filters.remote_regions`)
6. **Max posting age in days** (`filters.max_age_days`, null = no limit) and **drop undated postings** (`filters.drop_undated`)
7. **Seniority levels** (`filters.seniority`)
8. **Excluded title keywords** (`filters.exclude_keywords`)
9. **Must-haves** (`requirements.must_have`)
10. **Nice-to-haves** (`requirements.nice_to_have`)
11. **Deal-breakers** (`requirements.deal_breakers`)
12. **Salary minimum and currency** (`requirements.salary_min`, `salary_currency`)
13. **Source mode** (`source_mode`: portals / firecrawl / both). If they pick firecrawl or both, check that Firecrawl tools are available and warn if not.
14. **Portals**: show a count of ATS companies, APIs and web sources in `job-scan/portals.json`. Offer: Keep, Add/remove companies or sources (edit the file), or Restore the plugin defaults (`<root>/config/portals.json`, after backing up the current file as `portals.backup.json`).
15. **Threshold** (`threshold`)
16. **Max jobs per scan** (`max_jobs_per_scan`)

For items 2-16, update only the touched keys in `profile.yml` and keep comments and other keys intact. If the file still has the old top-level `locations`, `remote` or `remote_regions` keys, migrate them into `filters`.

## Final step
1. Show a summary of all changes (`item: old -> new`). If nothing changed, say so and stop. Otherwise ask for confirmation to save; on "no", discard.
2. Write `job-scan/profile.yml` (and the CV files if changed).
3. **Tracker impact**: if the CV, roles, locations, requirements or threshold changed, existing scores may be stale. Ask what to do with the tracker:
   - `Keep as is` (recommended if only source mode or max jobs changed)
   - `Re-score tracked jobs`: run `node "<root>/scripts/tracker.mjs" export --out job-scan/.runs/rescore/jobs.json` (Shortlisted and Skipped jobs only), split into batches of ~6, score them with parallel `job-scorer` agents exactly like `/job-scan:scan` step 4, then run `node "<root>/scripts/tracker.mjs" rescore --scored "<score files>" --threshold <threshold>`. Prepared, Applied, Interview and similar statuses are never changed. Report how many jobs were promoted or demoted.
   - `Clear tracker`: confirm explicitly, then `node "<root>/scripts/tracker.mjs" clear` (a backup is saved automatically).
   If only the threshold changed, no LLM scoring is needed: run `node "<root>/scripts/tracker.mjs" rescore --threshold <new>` (without `--scored`) to re-apply it to the stored scores, and report how many jobs were promoted or demoted.
4. Print what was saved and suggest `/job-scan:scan`.
