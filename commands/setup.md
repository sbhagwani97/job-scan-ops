---
description: One-time setup - convert your CV PDF to markdown and create your job-scan profile
argument-hint: [path-to-cv.pdf]
allowed-tools: Read, Write, Edit, Bash, AskUserQuestion
---

Set up job-scan in the current working directory. Data goes in `./job-scan/` (never inside the plugin).

Plugin root: `${CLAUDE_PLUGIN_ROOT}`. If that is empty, locate `scripts/tracker.mjs` of the job-scan plugin with Glob and use its parent as the root.

## Steps

1. **Init**: run `node "<root>/scripts/tracker.mjs" init --portals-src "<root>/config/portals.json"`. This creates `job-scan/{cv/original,applications}`, `tracker.json`, `tracker.md` and a user copy `job-scan/portals.json`. If the current directory is a git repo, make sure `job-scan/` is in `.gitignore` (append it if missing) because it holds personal data.

2. **CV path**: use `$ARGUMENTS` if given, else ask the user for the path to their CV (PDF preferred; `.md`, `.txt`, `.docx` also fine). Copy the original into `job-scan/cv/original/`.

3. **Convert to markdown**: Read the PDF (the Read tool reads PDFs natively) and write `job-scan/cv/cv.md`.
   - Preserve wording **verbatim**. Only add structure: `#` name, `##` sections (Summary, Experience, Education, Skills, Projects, Certifications, Languages), `###` per role as `Title - Company (dates)`, bullet lists for achievements, keep all numbers and dates.
   - Do not summarize, reword, add or drop content. Fix only obvious PDF artifacts (broken hyphenation, column interleaving, ligatures).
   - If a `.md` file was given, copy as-is.
   - If the PDF has no extractable text (scanned image), say so and ask for another format.

4. **Review**: tell the user the CV is saved at `job-scan/cv/cv.md`, show a short preview (first ~40 lines) and list any parts you were unsure about. Ask them to confirm or tell you what to fix; apply fixes until they confirm.

5. **CV profile**: from the confirmed `cv.md`, write `job-scan/cv/cv.profile.yml` with: `name`, `headline`, `total_years_experience`, `seniority` (junior/mid/senior/staff/lead), `titles` (list), `skills` (each with approximate `years` and where evidenced), `domains`, `education`, `languages`, `current_location`. Only facts present in the CV; use `unknown` otherwise.

6. **Preferences**: ask the user (use AskUserQuestion where choices are discrete, otherwise plain questions) for:
   - target **roles** (offer synonyms from their CV)
   - search **filters**: cities, countries, remote preference (include / only / exclude) and allowed remote regions, **max posting age in days** (suggest 14), seniority levels, and title keywords to exclude (e.g. intern)
   - **must-haves** (visa/right to work, salary floor, stack), **nice-to-haves**, **deal-breakers**
   - **source mode**: `portals` (free preset ATS boards and job APIs), `firecrawl` (needs a Firecrawl API key), or `both`
   - **threshold** (default 4.0)
   If they choose firecrawl/both, check whether Firecrawl tools are available (`FIRECRAWL_API_KEY` env var set / MCP connected). If not, tell them how to set it (see README) but continue; they can run portals-only meanwhile.

7. **Write profile**: using `<root>/templates/profile.yml` as the format, write `job-scan/profile.yml` with their answers.

8. **Finish**: print a short summary (files created, profile highlights) and say to run `/job-scan:scan` next.
