---
description: Evaluate your CV and profile against a single job URL, file or pasted description
argument-hint: <job-url | path-to-description | "pasted job description"> [--track] [--json]
allowed-tools: Read, Write, Bash, WebFetch, WebSearch, Glob, AskUserQuestion
---

Evaluate one job posting on its own, without running a full scan. Arguments: `$ARGUMENTS`. Plugin root: `${CLAUDE_PLUGIN_ROOT}` (if empty, locate `scripts/tracker.mjs` with Glob). This command never applies to the job.

## Steps

1. **Preflight**: require `job-scan/profile.yml`, `job-scan/cv/cv.md` and `job-scan/cv/cv.profile.yml`. If any is missing, tell the user to run `/job-scan:setup` and stop.

2. **Parse the input**: separate flags `--track` and `--json` from the rest of `$ARGUMENTS`.
   - If the input starts with `http://` or `https://`, WebFetch it as markdown. Use Firecrawl tools instead if they are available and the page is blocked or JS-heavy. Extract the company, job title, location, full description and the apply URL.
   - If the input is a path to an existing file, Read it as the description. Ask for the company/title/URL if they are not stated in the file.
   - Otherwise treat the input as a pasted job description. Ask for the company, title, location and URL if missing.
   - If no input was given, ask the user to paste a URL or the job description.
   - If the description is still under ~400 characters after fetching, say it is too short to score and ask the user to paste the full posting. Do not guess.

3. **Score** against the user's actual documents:
   - Read the rubric at `<root>/skills/job-scoring/SKILL.md`, then `job-scan/cv/cv.md`, `job-scan/cv/cv.profile.yml` and `job-scan/profile.yml`.
   - Follow the rubric exactly, including the hard caps for must-haves, deal-breakers and salary. Use only evidence that exists in the CV. Mark unmentioned requirements as `unknown` gaps, not violations.
   - Compare the result with the profile's `threshold` to choose a verdict: `APPLY` when the score is at or above the threshold with no knockout, `MAYBE` for 3.0 up to the threshold, `SKIP` otherwise.

4. **Report** concisely:
   - verdict, score out of 5, and whether a knockout applies (and why)
   - rationale in 2-3 sentences citing CV evidence
   - **matched**: requirements met, each with the CV evidence
   - **gaps**: requirements missing or unknown, and how to address each honestly
   - the posting's top requirements mapped to the CV
   - logistics: location, remote policy, seniority, salary if stated, and the apply link

5. **Save a report** to `job-scan/evaluations/<company>-<role>.md` (slugified) with the same content, plus the job URL, company, title, date and the raw description. Tell the user the path.

6. **Track only when asked**:
   - With `--track`, write `job-scan/.runs/eval-<YYYYMMDD-HHMM>/job.json` containing `company`, `title`, `location`, `url`, `source: "manual"`, `description`, `score`, `knockout`, `knockoutReason`, `rationale`, `matched` and `gaps`, then run `node "<root>/scripts/tracker.mjs" add --job "<file>" --threshold <profile threshold>`. Report the job id and resulting status.
   - Without `--track`, do not modify the tracker. If the verdict is `APPLY`, mention that `--track` adds it to the pipeline so `/job-scan:apply <id>` can prepare it.
   - With `--json`, also print the result as one JSON object: `company`, `title`, `location`, `url`, `score`, `knockout`, `knockoutReason`, `rationale`, `matched`, `gaps`, `verdict`.
