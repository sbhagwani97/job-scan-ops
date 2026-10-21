---
description: Search job sources, score each posting 1-5 against your CV, and update the tracker
argument-hint: [--portals | --firecrawl | --both] [--limit N] [--role "title"] [--location "city"] [--country "X"] [--days N] [--remote-only]
allowed-tools: Read, Write, Edit, Bash, Task, Glob, WebFetch, WebSearch, AskUserQuestion
---

Run a job scan. Arguments: `$ARGUMENTS` (optional overrides of the profile values).

Plugin root: `${CLAUDE_PLUGIN_ROOT}` (if empty, locate `scripts/tracker.mjs` with Glob and use its parent's parent). Load the `job-sourcing` and `job-scoring` skills for details.

## Steps

1. **Preflight**: require `job-scan/profile.yml`, `job-scan/cv/cv.md`, `job-scan/cv/cv.profile.yml`, `job-scan/portals.json`. If any is missing, tell the user to run `/job-scan:setup` and stop. Read the profile. Apply overrides from `$ARGUMENTS` (`--role`, `--location`, `--limit`, and mode flags override `source_mode`). Create a run id `RUN=<YYYYMMDD-HHMM>` and a scratch dir `job-scan/.runs/<RUN>/`.

2. **Fetch** (collect normalized jobs into files under the scratch dir):
   - If mode includes portals: run
     `node "<root>/scripts/fetch-jobs.mjs" --portals job-scan/portals.json --keywords "<roles comma-separated>" --locations "<filters.locations>" --countries "<filters.countries>" <remote flag> --remote-regions "<filters.remote_regions>" --max-age-days <filters.max_age_days> --exclude "<filters.exclude_keywords>" --seniority "<filters.seniority>" --out job-scan/.runs/<RUN>/portals.json`
     Map `filters.remote`: `include` -> `--remote`, `only` -> `--remote-only`, `exclude` -> `--no-remote`. Add `--drop-undated` if `filters.drop_undated` is true. Omit any flag whose value is empty or null. Command-line overrides from `$ARGUMENTS` win over the profile (`--days N` overrides max_age_days, `--country X` overrides countries). Include a country's main cities in `--locations` since many postings list only the city. The output reports `droppedByFilter` counts; mention them in the report. Note any failed sources.
   - If mode includes firecrawl: for each `web` entry in portals.json (those with `urlTemplate` or `searchQuery`) plus one ATS-discovery search per role, launch a `job-fetcher` agent (in parallel, one message). Give it the source, roles, locations, countries, remote preference, `max_age_days` (it fills `{days}` and `{seconds}` = days*86400 in templates and must drop postings older than that), exclude keywords, seniority, a per-source cap, and output file `job-scan/.runs/<RUN>/web-<n>.json`. If Firecrawl tools are not available, say so, fall back to WebFetch for what works, and mark blocked sources as failed.
   - Merge all job arrays into `job-scan/.runs/<RUN>/all.json` (concatenate `jobs` arrays).
   - Record `sources` attempted and `complete` = those that succeeded.

3. **De-duplicate against the tracker**:
   `node "<root>/scripts/tracker.mjs" filter --jobs job-scan/.runs/<RUN>/all.json --out job-scan/.runs/<RUN>/new.json --run <RUN>`
   Already-tracked postings are not re-scored. Read `new.json`. If it has more than `max_jobs_per_scan`, keep the best title matches up to the cap and tell the user how many were dropped.

4. **Score**: split `new.json` into batches of ~6 jobs (files `batch-<n>.json`). Launch one `job-scorer` agent per batch **in parallel** (single message with multiple Task calls). Give each: INPUT batch file, OUTPUT `scores-<n>.json`, and absolute/relative paths to `job-scan/cv/cv.md`, `job-scan/cv/cv.profile.yml`, `job-scan/profile.yml`, and the rubric `<root>/skills/job-scoring/SKILL.md`. Afterwards check every job id has a result; re-run any missing batch once. Results with `score: null` are skipped (not tracked) and mentioned in the report.

5. **Merge into tracker**:
   `node "<root>/scripts/tracker.mjs" merge --scored "<scores-1.json,scores-2.json,...>" --jobs job-scan/.runs/<RUN>/new.json --run <RUN> --threshold <threshold> --sources "<attempted>" --complete "<succeeded>"`
   This updates `job-scan/tracker.json` and re-renders `job-scan/tracker.md`. Source names for `--sources/--complete` must match the `source` field on jobs (e.g. `Stripe (greenhouse)`, `RemoteOK`).

6. **Clean up** `job-scan/.runs/<RUN>/` unless the user asked to keep it (keep it if anything failed, for debugging).

7. **Report** concisely:
   - counts: fetched, already known, new, scored, shortlisted (score >= threshold), closed
   - a table of the new shortlisted jobs: score, company, role, location, link, one-line rationale
   - failed sources
   - next step: `/job-scan:apply <id>` or `/job-scan:apply --shortlisted`
