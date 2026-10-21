#!/usr/bin/env node
// Fetch + normalize postings from free ATS/job-board APIs listed in portals.json.
// Usage: node fetch-jobs.mjs --portals job-scan/portals.json --keywords "software engineer,backend engineer"
//        [--locations "Berlin,Germany"] [--countries "Germany,UK"] [--remote | --remote-only | --no-remote]
//        [--remote-regions "EU"] [--max-age-days 14] [--drop-undated] [--exclude "intern,php"]
//        [--seniority "mid,senior"] [--only greenhouse,lever] --out jobs.json
// Output: { jobs: [...normalized], sources: {name: {ok, count, error?}} }

import fs from 'node:fs';
import { createHash } from 'node:crypto';

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const k = argv[i].slice(2), n = argv[i + 1];
    if (n === undefined || n.startsWith('--')) flags[k] = true; else { flags[k] = n; i++; }
  }
  return flags;
}
const flags = parseArgs(process.argv.slice(2));
if (!flags.portals || !flags.out || !flags.keywords) {
  console.error('usage: fetch-jobs.mjs --portals f --keywords "a,b" [--locations "x,y"] [--remote] [--only types] --out f');
  process.exit(1);
}

const portals = JSON.parse(fs.readFileSync(flags.portals, 'utf8').replace(/^\uFEFF/, ''));
const split = (s) => String(s === true ? '' : s || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
const phrases = split(flags.keywords);
const locations = split(flags.locations);
const only = new Set(split(flags.only));
const SENIORITY = new Set(['senior', 'junior', 'lead', 'staff', 'principal', 'sr', 'jr', 'ii', 'iii', 'the', 'and', 'of']);
const phraseTokens = phrases.map((p) => p.split(/[^a-z0-9+#.]+/).filter((w) => w && !SENIORITY.has(w)));

// ---- filters (all optional) ----
// --max-age-days N        drop postings older than N days (undated postings are kept unless --drop-undated)
// --countries "Germany,UK" country filter; names, ISO codes and common aliases are matched
// --remote                accept remote postings; --remote-only keeps only remote; --no-remote drops remote
// --remote-regions "EU"   remote postings must be open to one of these regions (or worldwide)
// --exclude "intern,php"  drop postings whose title contains any of these words
// --seniority "mid,senior" keep only titles of these levels (junior|mid|senior|staff|lead); unmarked titles count as mid
const maxAgeDays = flags['max-age-days'] ? Number(flags['max-age-days']) : null;
const dropUndated = !!flags['drop-undated'];
const remoteOnly = !!flags['remote-only'];
const noRemote = !!flags['no-remote'];
const excludeWords = split(flags.exclude);
const wantLevels = new Set(split(flags.seniority));

const COUNTRIES = {
  germany: ['germany', 'deutschland', 'de'], 'united kingdom': ['united kingdom', 'uk', 'gb', 'england', 'scotland', 'wales', 'great britain'],
  'united states': ['united states', 'usa', 'us', 'u.s.', 'america'], canada: ['canada', 'ca'], france: ['france', 'fr'], spain: ['spain', 'es', 'españa'],
  netherlands: ['netherlands', 'nl', 'holland'], ireland: ['ireland', 'ie'], india: ['india', 'in'], australia: ['australia', 'au'],
  switzerland: ['switzerland', 'ch'], austria: ['austria', 'at'], poland: ['poland', 'pl'], portugal: ['portugal', 'pt'], italy: ['italy', 'it'],
  sweden: ['sweden', 'se'], denmark: ['denmark', 'dk'], norway: ['norway'], finland: ['finland', 'fi'], singapore: ['singapore', 'sg'],
  japan: ['japan', 'jp'], brazil: ['brazil', 'br'], mexico: ['mexico', 'mx'], 'united arab emirates': ['united arab emirates', 'uae', 'dubai'],
  israel: ['israel', 'il'], belgium: ['belgium', 'be'], 'czech republic': ['czech republic', 'czechia', 'cz'], romania: ['romania', 'ro'],
};
const REGION_ALIASES = { eu: ['eu', 'europe', 'emea', 'european'], emea: ['emea', 'europe', 'eu'], europe: ['europe', 'eu', 'emea'], us: ['us', 'usa', 'united states', 'north america', 'americas'], na: ['north america', 'americas', 'us', 'canada'], apac: ['apac', 'asia'], latam: ['latam', 'latin america', 'americas'], uk: ['uk', 'united kingdom'] };
const WORLDWIDE = /worldwide|anywhere|global|international|any location|all countries/;
const aliasesOf = (name) => {
  const hit = Object.entries(COUNTRIES).find(([k, v]) => k === name || v.includes(name));
  return hit ? hit[1] : [name];
};
const countryTerms = split(flags.countries).flatMap(aliasesOf);
const regionTerms = split(flags['remote-regions']).flatMap((r) => REGION_ALIASES[r] || [r]);
const hasWord = (text, w) => (w.length <= 3 ? new RegExp(`(^|[^a-z])${w.replace(/\./g, '\\.')}([^a-z]|$)`).test(text) : text.includes(w));

const LEVEL_MARKERS = {
  junior: ['junior', 'jr', 'intern', 'internship', 'graduate', 'trainee', 'werkstudent', 'working student', 'entry level', 'apprentice'],
  senior: ['senior', 'sr'],
  staff: ['staff', 'principal'],
  lead: ['lead', 'head of', 'director', 'vp', 'vice president', 'manager', 'chief'],
};
const levelsOf = (title) => {
  const t = title.toLowerCase();
  const found = Object.entries(LEVEL_MARKERS).filter(([, ms]) => ms.some((m) => hasWord(t, m))).map(([l]) => l);
  return found.length ? found : ['mid'];
};

const drops = { title: 0, location: 0, country: 0, remote: 0, age: 0, undated: 0, exclude: 0, seniority: 0 };

const titleMatches = (title) => {
  const t = title.toLowerCase();
  return phraseTokens.some((tokens) => tokens.length && tokens.every((w) => t.includes(w)));
};

const isRemoteText = (l) => /remote|work from home|anywhere|distributed/.test(l);

const locationOk = (loc) => {
  const l = String(loc || '').toLowerCase();
  const remote = isRemoteText(l);
  if (remote && noRemote && !/hybrid/.test(l)) return 'remote';
  if (remoteOnly && l && !remote) return 'remote';
  if (!l) return null; // unknown location: let the scorer decide
  if (remote && (flags.remote || remoteOnly)) {
    if (regionTerms.length) {
      const rest = l.replace(/remote|hybrid|work from home|distributed|[-–()/,:;|]/g, ' ').replace(/\s+/g, ' ').trim();
      const regionOk = !rest || WORLDWIDE.test(l) || regionTerms.some((r) => hasWord(l, r)) || countryTerms.some((c) => hasWord(l, c)) || locations.some((x) => l.includes(x));
      return regionOk ? null : 'remote';
    }
    return null;
  }
  const terms = [...locations, ...countryTerms];
  if (!terms.length) return null;
  const match = locations.some((x) => l.includes(x)) || countryTerms.some((c) => hasWord(l, c));
  if (match) return null;
  return countryTerms.length && !locations.length ? 'country' : 'location';
};

const ageOk = (date) => {
  if (maxAgeDays == null) return null;
  if (!date) return dropUndated ? 'undated' : null;
  const age = (Date.now() - new Date(date).getTime()) / 86400000;
  return age > maxAgeDays ? 'age' : null;
};

// Returns the name of the filter that rejects a job, or null to keep it.
const rejectedBy = (j) => {
  if (!titleMatches(j._match || j.title)) return 'title';
  const tl = j.title.toLowerCase();
  if (excludeWords.some((w) => hasWord(tl, w))) return 'exclude';
  if (wantLevels.size && !levelsOf(j.title).some((l) => wantLevels.has(l))) return 'seniority';
  return locationOk(j.location) || ageOk(j.postedDate);
};

const decode = (s) => s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
const strip = (html) => decode(decode(String(html || '')).replace(/<(br|\/p|\/li|\/h\d)\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
const id = (url) => createHash('sha1').update(url).digest('hex').slice(0, 10);

const request = async (url, body) => {
  const r = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { 'User-Agent': 'job-scan/0.1 (+claude-code plugin)', Accept: '*/*', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(25000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r;
};
const get = async (url, body) => (await request(url, body)).json();
const getText = async (url) => (await request(url)).text();

const epoch = (n) => (n ? new Date(n * 1000).toISOString().slice(0, 10) : null);
const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1].replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, '').trim() : '';
};
const blocks = (xml, name) => [...xml.matchAll(new RegExp(`<${name}[ >][\\s\\S]*?</${name}>`, 'gi'))].map((m) => m[0]);

// needsFetch = the API gave no (or a very short) description; the scorer should open `url` to read the posting.
const job = (source, company, title, location, url, description, postedDate, matchText) => {
  const d = strip(description).slice(0, 8000);
  return {
    id: id(url), company, title: String(title || '').trim(), location: String(location || '').trim(), url,
    source, postedDate: postedDate ? String(postedDate).slice(0, 10) : null, description: d, ...(d.length < 400 ? { needsFetch: true } : {}),
    ...(matchText ? { _match: matchText } : {}),
  };
};

const fetchers = {
  async greenhouse(p) {
    const d = await get(`https://boards-api.greenhouse.io/v1/boards/${p.slug}/jobs?content=true`);
    return (d.jobs || []).map((j) => job(`${p.company} (greenhouse)`, p.company, j.title, j.location?.name, j.absolute_url, j.content, j.updated_at));
  },
  async lever(p) {
    const d = await get(`https://api.lever.co/v0/postings/${p.slug}?mode=json`);
    return d.map((j) => {
      const lists = (j.lists || []).map((l) => `${l.text}\n${l.content}`).join('\n');
      const desc = [j.descriptionPlain, strip(lists), j.additionalPlain].filter(Boolean).join('\n');
      return job(`${p.company} (lever)`, p.company, j.text, j.categories?.location, j.hostedUrl, desc, j.createdAt ? new Date(j.createdAt).toISOString().slice(0, 10) : null);
    });
  },
  async ashby(p) {
    const d = await get(`https://api.ashbyhq.com/posting-api/job-board/${p.slug}`);
    return (d.jobs || []).map((j) => job(`${p.company} (ashby)`, p.company, j.title, j.isRemote ? `${j.location || ''} (Remote)` : j.location, j.jobUrl, j.descriptionPlain || j.descriptionHtml, j.publishedAt?.slice(0, 10)));
  },
  async remoteok() {
    const d = await get('https://remoteok.com/api');
    return d.filter((j) => j.position).map((j) => job('RemoteOK', j.company, j.position, j.location || 'Remote', j.url, j.description, j.date?.slice(0, 10)));
  },
  async remotive() {
    const out = [];
    for (const k of phrases) {
      const d = await get(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(k)}`);
      out.push(...(d.jobs || []).map((j) => job('Remotive', j.company_name, j.title, `Remote - ${j.candidate_required_location}`, j.url, j.description, j.publication_date?.slice(0, 10))));
    }
    return out;
  },

  // ---- more company ATS boards ----
  async workable(p) {
    const out = [];
    let token;
    for (let page = 0; page < 15; page++) {
      const d = await get(`https://apply.workable.com/api/v3/accounts/${p.slug}/jobs`,
        { query: '', location: [], department: [], worktype: [], remote: [], ...(token ? { token } : {}) });
      for (const j of d.results || []) {
        const loc = [j.location?.city, j.location?.country].filter(Boolean).join(', ');
        out.push(job(`${p.company} (workable)`, p.company, j.title, j.remote || j.workplace === 'remote' ? `${loc} (Remote)` : loc,
          `https://apply.workable.com/${p.slug}/j/${j.shortcode}/`, '', j.published?.slice(0, 10)));
      }
      token = d.nextPage;
      if (!token) break;
    }
    return out;
  },
  async smartrecruiters(p) {
    const out = new Map();
    for (const k of phrases) {
      const d = await get(`https://api.smartrecruiters.com/v1/companies/${p.slug}/postings?limit=100&q=${encodeURIComponent(k)}`);
      for (const j of d.content || []) {
        const loc = j.location?.fullLocation || '';
        out.set(j.id, job(`${p.company} (smartrecruiters)`, p.company, j.name, j.location?.remote ? `${loc} (Remote)` : loc,
          `https://jobs.smartrecruiters.com/${p.slug}/${j.id}`, '', j.releasedDate?.slice(0, 10)));
      }
    }
    return [...out.values()];
  },
  async recruitee(p) {
    const d = await get(`https://${p.slug}.recruitee.com/api/offers/`);
    return (d.offers || []).filter((j) => !j.status || j.status === 'published').map((j) =>
      job(`${p.company} (recruitee)`, p.company, j.title, [j.location, j.remote ? 'Remote' : ''].filter(Boolean).join(' '),
        j.careers_url, `${j.description || ''}\n${j.requirements || ''}`, j.published_at?.slice(0, 10)));
  },
  // Personio XML feed. Best effort: not all companies expose it.
  async personio(p) {
    const xml = await getText(`https://${p.slug}.jobs.personio.de/xml`);
    return blocks(xml, 'position').map((b) => {
      const desc = blocks(b, 'jobDescription').map((x) => `${tag(x, 'name')}\n${tag(x, 'value')}`).join('\n');
      return job(`${p.company} (personio)`, p.company, tag(b, 'name'), tag(b, 'office'),
        `https://${p.slug}.jobs.personio.de/job/${tag(b, 'id')}`, desc, tag(b, 'createdAt').slice(0, 10));
    });
  },

  // ---- job-board APIs (no key) ----
  async arbeitnow(p) {
    const out = [];
    for (let page = 1; page <= (p.pages || 5); page++) {
      const d = await get(`https://www.arbeitnow.com/api/job-board-api?page=${page}`);
      out.push(...(d.data || []).map((j) => job('Arbeitnow', j.company_name, j.title, j.remote ? `${j.location} (Remote)` : j.location, j.url, j.description, epoch(j.created_at))));
      if (!d.links?.next) break;
    }
    return out;
  },
  async himalayas(p) {
    const out = new Map();
    for (const k of phrases) {
      for (let page = 1; page <= (p.pages || 2); page++) {
        const d = await get(`https://himalayas.app/jobs/api/search?q=${encodeURIComponent(k)}&sort=recent&page=${page}`);
        for (const j of d.jobs || []) {
          const loc = j.locationRestrictions?.length ? j.locationRestrictions.join(', ') : 'Worldwide';
          out.set(j.guid, job('Himalayas', j.companyName, j.title, `Remote - ${loc}`, j.applicationLink || j.guid, j.description, epoch(j.pubDate)));
        }
        if (!(d.jobs || []).length) break;
      }
    }
    return [...out.values()];
  },
  async jobicy() {
    const out = new Map();
    for (const k of phrases) {
      const d = await get(`https://jobicy.com/api/v2/remote-jobs?count=50&tag=${encodeURIComponent(k)}`);
      for (const j of d.jobs || []) out.set(j.id, job('Jobicy', j.companyName, j.jobTitle, `Remote - ${j.jobGeo}`, j.url, j.jobDescription || j.jobExcerpt, j.pubDate?.slice(0, 10)));
    }
    return [...out.values()];
  },
  // The Muse: set "categories" (e.g. "Software Engineering", "Data and Analytics") and "pages" in portals.json.
  async themuse(p) {
    const out = [];
    for (const c of p.categories || ['Software Engineering']) {
      for (let page = 1; page <= (p.pages || 3); page++) {
        const d = await get(`https://www.themuse.com/api/public/jobs?page=${page}&category=${encodeURIComponent(c)}`);
        out.push(...(d.results || []).map((j) => job('The Muse', j.company?.name, j.name, (j.locations || []).map((l) => l.name).join('; '), j.refs?.landing_page, j.contents, j.publication_date?.slice(0, 10))));
        if (page >= d.page_count) break;
      }
    }
    return out;
  },
  async weworkremotely(p) {
    const feeds = p.feeds || ['https://weworkremotely.com/remote-jobs.rss'];
    const out = [];
    for (const f of feeds) {
      const xml = await getText(f);
      for (const b of blocks(xml, 'item')) {
        const [company, ...rest] = tag(b, 'title').split(': ');
        out.push(job('We Work Remotely', company, rest.join(': ') || company, `Remote - ${tag(b, 'region') || 'Anywhere'}`,
          tag(b, 'link') || tag(b, 'guid'), tag(b, 'description'), new Date(tag(b, 'pubDate') || Date.now()).toISOString().slice(0, 10)));
      }
    }
    return out;
  },
  async workingnomads() {
    const d = await get('https://www.workingnomads.com/api/exposed_jobs/');
    return d.map((j) => job('Working Nomads', j.company_name, j.title, `Remote - ${j.location || 'Anywhere'}`, j.url, j.description, j.pub_date?.slice(0, 10)));
  },
  // Hacker News "Ask HN: Who is hiring?" - each top-level comment is a posting (startup-heavy).
  async hackernews() {
    const s = await get('https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=5');
    const story = (s.hits || []).find((h) => /who is hiring/i.test(h.title));
    if (!story) return [];
    const out = [];
    for (let page = 0; page < 3; page++) {
      const d = await get(`https://hn.algolia.com/api/v1/search_by_date?tags=comment,story_${story.objectID}&hitsPerPage=1000&page=${page}`);
      for (const c of d.hits || []) {
        if (String(c.parent_id) !== String(story.objectID) || !c.comment_text) continue;
        const text = strip(c.comment_text);
        const first = text.split('\n')[0].slice(0, 160);
        out.push(job('HN Who is hiring', first.split('|')[0].trim(), first, first,
          `https://news.ycombinator.com/item?id=${c.objectID}`, text, c.created_at?.slice(0, 10), text.slice(0, 500)));
      }
      if (page + 1 >= (d.nbPages || 1)) break;
    }
    return out;
  },
};

const tasks = [
  ...(portals.ats || []).map((p) => ({ name: `${p.company} (${p.type})`, type: p.type, run: () => fetchers[p.type]?.(p) })),
  ...(portals.api || []).map((p) => ({ name: p.name, type: p.type, run: () => fetchers[p.type]?.(p) })),
].filter((t) => !only.size || only.has(t.type));

const sources = {};
const jobs = [];
for (let i = 0; i < tasks.length; i += 8) {
  const batch = tasks.slice(i, i + 8);
  const res = await Promise.allSettled(batch.map((t) => Promise.resolve(t.run() ?? Promise.reject(new Error('unknown type')))));
  res.forEach((r, k) => {
    const name = batch[k].name;
    if (r.status === 'fulfilled') {
      const kept = [];
      const dropped = {};
      for (const { _match, ...j } of r.value) {
        const why = j.url ? rejectedBy({ ...j, _match }) : 'title';
        if (why) { drops[why]++; dropped[why] = (dropped[why] || 0) + 1; } else kept.push(j);
      }
      sources[name] = { ok: true, fetched: r.value.length, count: kept.length, dropped };
      jobs.push(...kept);
    } else sources[name] = { ok: false, error: String(r.reason?.message || r.reason) };
  });
}

fs.writeFileSync(flags.out, JSON.stringify({ jobs, sources }, null, 2));
const failed = Object.entries(sources).filter(([, v]) => !v.ok).map(([k, v]) => `${k}: ${v.error}`);
console.log(JSON.stringify({ jobs: jobs.length, sourcesOk: Object.values(sources).filter((v) => v.ok).length, droppedByFilter: drops, failed, out: flags.out }));
