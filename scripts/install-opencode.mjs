#!/usr/bin/env node
// Installs job-scan into an OpenCode project (or globally) by converting the
// Claude Code plugin layout into OpenCode's layout. Zero dependencies.
//
//   node scripts/install-opencode.mjs [targetProjectDir] [--global] [--no-mcp] [--dry-run]
//
// Project install (default, target defaults to cwd):
//   <target>/.opencode/commands/job-scan*.md
//   <target>/.opencode/agents/job-{scorer,fetcher}.md
//   <target>/.opencode/skills/job-{scoring,sourcing}/SKILL.md
//   <target>/.opencode/job-scan/{scripts,config,templates,skills}   (support files)
//   <target>/opencode.json                                           (firecrawl MCP merged in)
// Global install: same layout under ~/.config/opencode (config file: opencode.json there).

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const positional = args.filter((a) => !a.startsWith('--'));
const GLOBAL = flag('--global');
const DRY = flag('--dry-run');
const NO_MCP = flag('--no-mcp');

const baseDir = GLOBAL
  ? path.join(os.homedir(), '.config', 'opencode')
  : path.join(path.resolve(positional[0] || process.cwd()), '.opencode');
const configDir = GLOBAL ? baseDir : path.dirname(baseDir);
const supportDir = path.join(baseDir, 'job-scan');
// Path that commands use for "<root>": relative for project installs, absolute for global.
const rootRef = GLOBAL ? supportDir.replace(/\\/g, '/') : '.opencode/job-scan';

const cmdName = (n) => (n === 'scan' ? 'job-scan' : `job-scan-${n}`);

function write(file, content) {
  console.log(`${DRY ? '[dry] ' : ''}write ${path.relative(process.cwd(), file) || file}`);
  if (DRY) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function copyDir(from, to) {
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const f = path.join(from, e.name);
    const t = path.join(to, e.name);
    if (e.isDirectory()) copyDir(f, t);
    else write(t, fs.readFileSync(f));
  }
}

function splitFrontmatter(text) {
  text = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { fm: {}, body: text };
  const fm = {};
  for (const line of m[1].split('\n')) {
    const k = line.match(/^([\w-]+):\s*(.*)$/);
    if (k) fm[k[1]] = k[2];
  }
  return { fm, body: m[2] };
}

function convertBody(body) {
  return body
    // "Plugin root: `${CLAUDE_PLUGIN_ROOT}` (if empty ...)" and the setup.md variant
    .replace(/`\$\{CLAUDE_PLUGIN_ROOT\}`\.\s*If that is empty[^\n]*?as the root\./g, `\`${rootRef}\`.`)
    .replace(/`\$\{CLAUDE_PLUGIN_ROOT\}`\s*\([^)]*\)/g, `\`${rootRef}\``)
    .replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, rootRef)
    .replace(/\/job-scan:(\w+)/g, (_, n) => '/' + cmdName(n))
    .replace(/AskUserQuestion/g, 'question tool')
    .replace(/Claude reads/g, 'The model reads');
}

const yamlStr = (s) => JSON.stringify(s);

// ---------- commands ----------
function installCommands() {
  const dir = path.join(SRC, 'commands');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    const name = f.replace(/\.md$/, '');
    const { fm, body } = splitFrontmatter(fs.readFileSync(path.join(dir, f), 'utf8'));
    let desc = fm.description || `job-scan ${name}`;
    if (fm['argument-hint']) desc += ` | args: ${fm['argument-hint']}`;
    const out = `---\ndescription: ${yamlStr(desc)}\n---\n${convertBody(body)}`;
    write(path.join(baseDir, 'commands', `${cmdName(name)}.md`), out);
  }
}

// ---------- agents ----------
const AGENT_PERMS = {
  'job-scorer': 'permission:\n  read: allow\n  edit: allow\n  webfetch: allow\n  shell: deny\n  task: deny\n',
  'job-fetcher': 'permission:\n  read: allow\n  edit: allow\n  webfetch: allow\n  websearch: allow\n  "firecrawl_*": allow\n  shell: deny\n  task: deny\n',
};
function installAgents() {
  const dir = path.join(SRC, 'agents');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    const name = f.replace(/\.md$/, '');
    const { fm, body } = splitFrontmatter(fs.readFileSync(path.join(dir, f), 'utf8'));
    const perms = AGENT_PERMS[name] || '';
    const out = `---\ndescription: ${yamlStr(fm.description || name)}\nmode: subagent\n${perms}---\n${convertBody(body)}`;
    write(path.join(baseDir, 'agents', f), out);
  }
}

// ---------- skills + support files ----------
function installSkills() {
  const dir = path.join(SRC, 'skills');
  for (const s of fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory())) {
    const text = fs.readFileSync(path.join(dir, s.name, 'SKILL.md'), 'utf8');
    const { fm, body } = splitFrontmatter(text);
    const out = `---\nname: ${s.name}\ndescription: ${yamlStr(fm.description || s.name)}\n---\n${convertBody(body)}`;
    write(path.join(baseDir, 'skills', s.name, 'SKILL.md'), out);
    // commands reference <root>/skills/<name>/SKILL.md for the scoring rubric
    write(path.join(supportDir, 'skills', s.name, 'SKILL.md'), out);
  }
}

function installSupport() {
  for (const d of ['scripts', 'config']) copyDir(path.join(SRC, d), path.join(supportDir, d));
  // do not ship the installer itself into the support dir
  if (!DRY) fs.rmSync(path.join(supportDir, 'scripts', 'install-opencode.mjs'), { force: true });
  const tdir = path.join(SRC, 'templates');
  for (const f of fs.readdirSync(tdir)) {
    write(path.join(supportDir, 'templates', f), convertBody(fs.readFileSync(path.join(tdir, f), 'utf8')));
  }
}

// ---------- MCP ----------
function installMcp() {
  if (NO_MCP) return;
  const entry = {
    type: 'local',
    command: ['npx', '-y', 'firecrawl-mcp'],
    environment: { FIRECRAWL_API_KEY: '{env:FIRECRAWL_API_KEY}' },
    enabled: true,
  };
  const candidates = ['opencode.json', 'opencode.jsonc'].map((n) => path.join(configDir, n));
  const existing = candidates.find((p) => fs.existsSync(p));
  const file = existing || candidates[0];
  let cfg = { $schema: 'https://opencode.ai/config.json' };
  if (existing) {
    try {
      cfg = JSON.parse(fs.readFileSync(existing, 'utf8').replace(/^\uFEFF/, ''));
    } catch {
      console.log(`\nCould not parse ${existing} (comments?). Add this under "mcp" yourself:`);
      console.log(JSON.stringify({ firecrawl: entry }, null, 2));
      return;
    }
  }
  cfg.mcp = cfg.mcp || {};
  if (cfg.mcp.firecrawl) {
    console.log('opencode config already has an "mcp.firecrawl" entry; left unchanged.');
    return;
  }
  cfg.mcp.firecrawl = entry;
  write(file, JSON.stringify(cfg, null, 2) + '\n');
}

installCommands();
installAgents();
installSkills();
installSupport();
installMcp();

const list = ['setup', 'scan', 'apply', 'tracker', 'reset'].map((n) => '/' + cmdName(n)).join('  ');
console.log(`\n${DRY ? '(dry run) ' : ''}Installed job-scan for OpenCode in ${baseDir}`);
console.log(`Commands: ${list}`);
console.log('Optional: set FIRECRAWL_API_KEY for the Firecrawl sources. Start with /job-scan-setup path/to/cv.pdf');
