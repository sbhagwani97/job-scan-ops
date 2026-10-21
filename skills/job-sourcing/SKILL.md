---
name: job-sourcing
description: How to discover and normalize job postings from preset portals (scripts/fetch-jobs.mjs) and from web sources via the Firecrawl MCP or WebFetch. Use when searching for jobs or adding portals.
---

# Job sourcing

## Normalized job schema
Every source must end up as objects with these fields (write them as a JSON array to a file):
```json
{ "id": "sha1(url) first 10 hex", "company": "", "title": "", "location": "", "url": "",
  "source": "LinkedIn", "postedDate": "YYYY-MM-DD or null", "description": "plain text, max 8000 chars" }
```
`id` = first 10 hex chars of SHA-1 of the posting URL. For web results, compute it with:
`node -e "console.log(require('crypto').createHash('sha1').update(process.argv[1]).digest('hex').slice(0,10))" "<url>"`
or just let `tracker.mjs filter` assign it (it does so when `id` is missing).

## 1. Preset portals (no key needed)
`scripts/fetch-jobs.mjs` handles these `portals.json` entries:
- `ats` types: `greenhouse`, `lever`, `ashby`, `workable`, `smartrecruiters`, `recruitee`, `personio`. To add a company, append `{ "company": "X", "type": "...", "slug": "x" }`. The slug comes from the careers URL: `boards.greenhouse.io/<slug>`, `jobs.lever.co/<slug>`, `jobs.ashbyhq.com/<slug>`, `apply.workable.com/<slug>`, `jobs.smartrecruiters.com/<Slug>` (case-sensitive), `<slug>.recruitee.com`, `<slug>.jobs.personio.de`.
- `api` types: `remoteok`, `remotive`, `arbeitnow` (Germany/Europe), `himalayas`, `jobicy`, `themuse`, `weworkremotely`, `workingnomads`, `hackernews` (monthly "Who is hiring").

### Filters
The script applies these before anything is scored. All are optional:
`--locations`, `--countries` (names, ISO codes, aliases like UK/GB/England), `--remote | --remote-only | --no-remote`, `--remote-regions` (remote roles must be open to the region or worldwide), `--max-age-days`, `--drop-undated`, `--exclude` (title keywords), `--seniority` (junior|mid|senior|staff|lead; unmarked titles count as mid). Its output includes `droppedByFilter` counts.

### Thin descriptions
Some sources (Workable, SmartRecruiters, Jobicy, ...) return no full description. Those jobs carry `needsFetch: true` and the scorer opens the URL before scoring.

## 2. Web sources (Firecrawl MCP, fallback WebFetch)
For `web` entries in portals.json, and for open-ended discovery:
- Prefer Firecrawl tools if available (names contain `firecrawl`): `firecrawl_search` for discovery queries like `"<role>" jobs "<location>" site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashbyhq.com`, and `firecrawl_scrape` (markdown format, main content only) for a listing page or posting.
- If Firecrawl is unavailable, use WebFetch / WebSearch. Expect login walls on LinkedIn/Indeed. If a source blocks you, record it as failed and move on; do not try to bypass logins or CAPTCHAs.
- Fill the `urlTemplate` placeholders: `{role}` URL-encoded role, `{location}` URL-encoded location, `{role_slug}` / `{location_slug}` lowercase-hyphenated, `{days}` = max age in days, `{seconds}` = days*86400. Entries with `searchQuery` instead of `urlTemplate` are web-search queries (same placeholders).
- Listing pages usually give only title/company/location/URL. Open each candidate posting to get the full description, but only for postings whose title plausibly matches a target role (saves credits).
- Discovery queries that surface ATS-hosted postings (greenhouse/lever/ashby) are the most reliable: those pages are plain and scrape cleanly.

## Rules
- Respect `max_jobs_per_scan` from the profile.
- Never fabricate fields. Use `""` for unknown location and `null` for unknown date.
- Report which sources succeeded and which failed; the tracker only closes postings for sources that completed.
