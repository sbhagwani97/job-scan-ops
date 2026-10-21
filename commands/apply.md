---
description: Prepare application materials (cover letter, CV notes, screening answers) for shortlisted jobs
argument-hint: <job-id> | --shortlisted
allowed-tools: Read, Write, Edit, Bash, WebFetch, Glob, AskUserQuestion
---

Prepare applications. Arguments: `$ARGUMENTS`. You **never submit** applications; the user does. Plugin root: `${CLAUDE_PLUGIN_ROOT}` (if empty, locate `scripts/tracker.mjs` with Glob).

## Steps

1. **Select jobs**: a job id (prefix ok) from `$ARGUMENTS`, or with `--shortlisted` all jobs from `node "<root>/scripts/tracker.mjs" list --status Shortlisted --json`. With no argument, list shortlisted jobs and ask which to prepare.

2. For each job:
   - `node "<root>/scripts/tracker.mjs" show <id>` to load the stored description. If the description is short (<500 chars) or the user wants fresh data, WebFetch the URL to get the full posting and any screening questions. If the posting is gone, set status `Closed` and skip.
   - Read `job-scan/cv/cv.md`, `job-scan/profile.yml` and `<root>/templates/cover-letter.md`.
   - Create `job-scan/applications/<company>-<role>/` (slugified) containing:
     - `cover-letter.md`: follow the template guide. Use ONLY facts from the CV. Never invent employers, numbers, skills or dates.
     - `cv-notes.md`: which CV sections/bullets to lead with for this job, keywords from the posting to mirror (only if truthful), and honest gaps with a suggested way to address each (use the stored `gaps`).
     - `screening-answers.md`: draft answers to any application questions found in the posting; mark anything you cannot answer from the CV as `TODO(user)`.
     - `apply.md`: job title, company, score and rationale, **apply link**, and a checklist.
   - Set status: `node "<root>/scripts/tracker.mjs" set-status <id> Prepared`.

3. **Report**: for each job, the folder path and the apply link. Tell the user to submit the application themselves and then confirm. When the user confirms they submitted (now or later), run `set-status <id> Applied --note "<optional>"`. Ask once whether they have already submitted any of these; do not mark Applied without a clear yes.
