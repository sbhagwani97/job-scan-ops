# job-scan

A Claude Code plugin that searches job sources, scores every posting from 1 to 5 against your CV, keeps a running `tracker.md`, and prepares applications for the strong matches.

- **Sources:** about 80 company ATS boards and 9 job-board APIs with no key needed, plus the Firecrawl MCP (optional) for web sources such as LinkedIn, Indeed and Wellfound.
- **Filters:** by city, country, remote preference and region, posting age, seniority and excluded keywords.
- **Scoring:** one holistic 1.0-5.0 score per job, with a rationale, matched skills and gaps. Violating a must-have or deal-breaker caps the score below the threshold.
- **Tracker:** `job-scan/tracker.md` is updated on every scan. It records new, known, shortlisted and closed postings, plus a scan log.
- **Apply:** the plugin prepares a cover letter, CV notes and screening answers. **You submit the application yourself.** The plugin never auto-submits.

## Requirements
- Claude Code or OpenCode
- Node.js 18+ (used by the fetch and tracker scripts; no `npm install` needed)
- Optional: a [Firecrawl](https://firecrawl.dev) API key for web sources

## Install
Load it locally while developing:

```bash
claude --plugin-dir /path/to/job-scan-plugin
```

Or install it from a plugin marketplace once the repo is published. Commands are namespaced by the plugin name: `/job-scan:setup`, `/job-scan:scan`, `/job-scan:apply`, `/job-scan:tracker`.

### Firecrawl (optional)
The plugin ships a `.mcp.json` that starts `firecrawl-mcp`. Set your key before launching Claude Code:

```bash
# macOS/Linux
export FIRECRAWL_API_KEY=fc-...
# Windows PowerShell
$env:FIRECRAWL_API_KEY = "fc-..."
```

Without a key, use `source_mode: portals`. The Firecrawl server will fail to start, but everything else works.

## Using with OpenCode
The same repo also works in [OpenCode](https://opencode.ai). OpenCode does not load Claude Code plugins, so an installer converts the files into OpenCode's layout:

```bash
# from your job-search project directory
node /path/to/job-scan-plugin/scripts/install-opencode.mjs          # project install into ./.opencode
node /path/to/job-scan-plugin/scripts/install-opencode.mjs --global  # or into ~/.config/opencode
```

Options: `--no-mcp` (don't touch `opencode.json`), `--dry-run` (list what would be written). Re-run it after pulling updates; it only overwrites its own files and never touches your `job-scan/` data.

What it does:
- Writes the commands to `.opencode/commands/`. OpenCode has no plugin namespace, so they are renamed: `/job-scan-setup`, `/job-scan` (the scan), `/job-scan-apply`, `/job-scan-tracker`, `/job-scan-reset`. Everything below applies with those names instead of `/job-scan:*`.
- Writes the subagents to `.opencode/agents/` (`mode: subagent` with `permission:` rules) and the skills to `.opencode/skills/`.
- Copies the scripts, portals and templates to `.opencode/job-scan/` and points the commands there.
- Adds the Firecrawl MCP server to `opencode.json` (`mcp.firecrawl`, key read from `FIRECRAWL_API_KEY`). If your config has comments and can't be parsed, it prints the snippet to paste.

Notes: CV conversion needs a model that can read PDFs; otherwise pass a `.md` or `.txt` CV. The OpenCode conversion has not been tested against every model, so report anything that breaks.

## Quick start

Run these from the directory where you want your job-search data to live (not inside the plugin folder):

1. `/job-scan:setup path/to/cv.pdf`
   - Claude reads the PDF and writes a verbatim-structure markdown version to `job-scan/cv/cv.md`.
   - You review it and approve or fix it.
   - Claude extracts a structured `cv.profile.yml`.
   - Claude asks for your roles, locations, must-haves, deal-breakers, source mode and threshold, and saves them to `job-scan/profile.yml`.
2. `/job-scan:scan`
   - Fetches jobs, skips ones already in the tracker, scores the new ones in parallel, and updates the tracker.
   - Prints the new shortlisted jobs with links.
3. `/job-scan:apply <job-id>` or `/job-scan:apply --shortlisted`
   - Writes materials to `job-scan/applications/<company>-<role>/` and sets the status to `Prepared`.
4. Submit the application yourself, then tell Claude. It runs `set-status <id> Applied`.

Repeat step 2 whenever you want a fresh scan. Only new postings are scored, so repeat scans are cheap.

## Commands

| Command | What it does |
|---|---|
| `/job-scan:setup [cv.pdf]` | Create `job-scan/`, convert and review the CV, build `profile.yml` |
| `/job-scan:scan [--portals\|--firecrawl\|--both] [--limit N] [--role "x"] [--location "y"] [--country "z"] [--days N] [--remote-only]` | Fetch, filter, dedupe, score and update the tracker |
| `/job-scan:apply <id>\|--shortlisted` | Prepare cover letter, CV notes and screening answers |
| `/job-scan:tracker [list\|show <id>\|set <id> <status> [note]\|render]` | View or update the tracker |
| `/job-scan:reset [cv\|roles\|locations\|requirements\|sources\|threshold]` | Go through your CV and every preference one by one: keep as is or modify. Optionally re-scores the tracker afterwards |

## Files created in your project

```
job-scan/
├─ profile.yml            # roles, locations, requirements, source mode, threshold
├─ portals.json           # your copy of the portal list: edit freely
├─ cv/
│  ├─ original/<cv>.pdf
│  ├─ cv.md               # reviewed markdown CV
│  └─ cv.profile.yml      # extracted skills, seniority, titles
├─ tracker.md             # generated, human-readable view
├─ tracker.json           # source of truth
└─ applications/<company>-<role>/
   ├─ cover-letter.md
   ├─ cv-notes.md
   ├─ screening-answers.md
   └─ apply.md            # apply link and checklist
```

`job-scan/` contains personal data. Setup adds it to `.gitignore` if the directory is a git repo.

## Tracker

`tracker.md` has three tables and a scan log:
- **Active pipeline:** Shortlisted, Prepared, Applied, Interview and Offer.
- **Below threshold / skipped:** auto-skipped low scores and knockouts.
- **Rejected / closed:** postings you rejected, and postings that have disappeared from a source that was fully fetched.

Statuses: `Shortlisted`, `Prepared`, `Applied`, `Interview`, `Offer`, `Rejected`, `Skipped`, `Closed`.

Change them with `/job-scan:tracker set <id> Interview "phone screen Tue"`. `tracker.md` is regenerated from `tracker.json`, so don't edit it by hand.

A re-scan never overwrites a status you set. A posting is closed only when its source was fully fetched in that run and the posting did not appear.

## How scoring works

Each new job is scored by a `job-scorer` subagent (batches of about 6, run in parallel) using the rubric in `skills/job-scoring/SKILL.md`.

| Score | Meaning |
|---|---|
| 5.0 | Near-perfect fit with evidence for every core requirement |
| 4.0-4.9 | Strong fit, minor gaps. **Worth applying.** |
| 3.0-3.9 | Plausible, with real gaps |
| 2.0-2.9 | Weak |
| 1.0-1.9 | Wrong job |

- **Threshold:** a job is shortlisted when `score >= threshold` (default **4.0**, set `threshold` in `profile.yml`). Set it to `4.1` if you want strictly more than 4.
- **Knockouts:** a violated must-have, a deal-breaker, or a salary clearly below your minimum caps the score and the job is not shortlisted. A requirement that is simply unmentioned is not a violation; it is listed in `gaps` as "unknown".
- LLM scores vary by a few tenths between runs. Scores are stored, so a job is scored once and not re-scored.

## Configuration: `job-scan/profile.yml`

| Key | Meaning |
|---|---|
| `roles` | Titles to search for. Include synonyms. |
| `filters.*` | Search filters, see below. Applied before scoring. |
| `requirements.must_have / nice_to_have / deal_breakers` | Hard and soft requirements, judged by the scorer |
| `requirements.salary_min`, `salary_currency` | Salary floor (a clearly lower stated salary is a knockout) |
| `source_mode` | `portals`, `firecrawl` or `both` |
| `threshold` | Shortlist cutoff, default 4.0 |
| `max_jobs_per_scan` | Cap on postings sent to scoring (controls token cost) |

### Filters

| Key | Meaning |
|---|---|
| `filters.locations` | Cities as they appear in postings (substring match). List main cities of your target country. |
| `filters.countries` | Country names or ISO codes (`Germany`, `DE`, `UK`, `US`). Aliases are understood (UK = GB = England). |
| `filters.remote` | `include` (remote plus your locations), `only` (remote only) or `exclude` |
| `filters.remote_regions` | e.g. `[EU]`. A remote posting must be open to one of these regions or worldwide. A bare "Remote" always passes. |
| `filters.max_age_days` | Drop postings older than N days (`null` = no limit). Undated postings are kept unless `drop_undated: true`. |
| `filters.seniority` | `junior`, `mid`, `senior`, `staff`, `lead`. Detected from title words, and an unmarked title counts as mid. |
| `filters.exclude_keywords` | Drop titles containing any of these words (e.g. `intern`, `php`) |

Override per scan, for example `/job-scan:scan --days 3 --country Netherlands --remote-only`. Each scan reports how many postings each filter removed.

Postings with an unknown location are kept, and the scorer judges them. The date filter relies on the posting date a source provides, and some sources omit it. For web sources the recency filter is applied through the site's own URL parameters where possible (LinkedIn, Indeed, ...).

## Adding sources

Starter list in `config/portals.json` (copied to `job-scan/portals.json` at setup):

| Kind | Sources |
|---|---|
| **Company ATS boards** (free APIs, about 80 companies to start) | Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Recruitee, Personio |
| **Job-board APIs** (free, no key) | RemoteOK, Remotive, Arbeitnow (Germany/Europe), Himalayas, Jobicy, The Muse, We Work Remotely, Working Nomads, Hacker News "Who is hiring" |
| **Web sources** (Firecrawl, or WebFetch as a fallback) | LinkedIn, Indeed, Glassdoor, Wellfound, Work at a Startup (YC), Welcome to the Jungle, StepStone, XING, Naukri, Built In, Dice, ZipRecruiter, Reed, SEEK, plus an ATS-discovery web search |

Add a company by editing `job-scan/portals.json`:

```json
{ "company": "Acme", "type": "greenhouse", "slug": "acme" }
```

| `type` | Slug comes from |
|---|---|
| `greenhouse` | `boards.greenhouse.io/<slug>` |
| `lever` | `jobs.lever.co/<slug>` |
| `ashby` | `jobs.ashbyhq.com/<slug>` |
| `workable` | `apply.workable.com/<slug>` |
| `smartrecruiters` | `jobs.smartrecruiters.com/<Slug>` (case-sensitive) |
| `recruitee` | `<slug>.recruitee.com` |
| `personio` | `<slug>.jobs.personio.de` (best effort; the feed is not enabled for every company) |

A wrong slug just logs an error for that source. Some APIs (Workable, SmartRecruiters, Jobicy) return no full description, so the scorer opens the posting URL before scoring those.

`web` entries take a `urlTemplate` (or a `searchQuery`) with `{role}`, `{role_slug}`, `{location}`, `{location_slug}`, `{days}` and `{seconds}` placeholders. LinkedIn and Indeed block bots, so expect partial results from them. The plugin does not bypass logins or CAPTCHAs. Edit the domains (`de.indeed.com`, `stepstone.de`, ...) for your country.

## Limitations
- Aggregator sites (LinkedIn, Indeed, Glassdoor) are unreliable to scrape. Company ATS pages are the most reliable source.
- Location filtering is substring-based on the posting's location text, and country matching uses a built-in alias table of about 30 countries (other countries match by the name you give).
- Scores are LLM judgments. Treat them as triage, and read the rationale before applying.
- Firecrawl usage consumes your Firecrawl credits.
- Check each site's terms of service before scraping it.

## Development

```
.claude-plugin/plugin.json   manifest
.mcp.json                    Firecrawl MCP server
commands/                    setup, scan, apply, tracker, reset
skills/                      job-scoring (rubric), job-sourcing (fetch rules)
agents/                      job-scorer, job-fetcher
scripts/fetch-jobs.mjs       ATS and API fetcher + normalizer
scripts/tracker.mjs          dedupe, merge, status changes, tracker.md rendering
config/portals.json          starter portal list
templates/                   profile.yml, cover-letter.md
```

Test the scripts directly:

```bash
node scripts/tracker.mjs init --portals-src config/portals.json
node scripts/fetch-jobs.mjs --portals job-scan/portals.json --keywords "backend engineer" --locations "Berlin" --countries Germany --remote --max-age-days 14 --seniority "mid,senior" --out jobs.json
node scripts/tracker.mjs list
```
