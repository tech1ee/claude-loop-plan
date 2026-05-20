#!/usr/bin/env node
import * as p from '@clack/prompts';
import { cp, chmod, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
// In dist/src/install.js; project root is two levels up
const PKG_ROOT = join(__dirname, '../..');
const CLAUDE_DIR = join(homedir(), '.claude');
const VERSION = JSON.parse(
  await readFile(join(PKG_ROOT, 'package.json'), 'utf8')
).version as string;
const PKG_NAME = '@loopskills/claude-skills';

// ── helpers ──────────────────────────────────────────────────────────────────

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

async function sha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(filePath).on('data', d => hash.update(d))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });
}

async function checkUpdate(current: string): Promise<void> {
  if (process.env['NO_UPDATE_NOTIFIER'] || process.env['CI']) return;
  const cacheFile = join(CLAUDE_DIR, 'skills', '.update-check.json');
  const TTL_MS = 24 * 60 * 60 * 1000;
  try {
    const cached = JSON.parse(await readFile(cacheFile, 'utf8'));
    if (Date.now() - cached.checked_at < TTL_MS && cached.latest !== current) {
      console.log(`\n  Update available: ${current} → ${cached.latest}`);
      console.log(`  Run: npm i -g ${PKG_NAME}@latest\n`);
    }
    if (Date.now() - cached.checked_at < TTL_MS) return;
  } catch { /* no cache */ }

  // Fire-and-forget background check
  fetch(`https://registry.npmjs.org/-/package/${PKG_NAME}/dist-tags`, {
    signal: AbortSignal.timeout(3000)
  }).then(r => r.json()).then(async (data: Record<string, string>) => {
    const latest = data['latest'];
    await mkdir(dirname(cacheFile), { recursive: true });
    await writeFile(cacheFile, JSON.stringify({ latest, checked_at: Date.now() }));
    if (latest && latest !== current) {
      console.log(`\n  Update available: ${current} → ${latest}`);
      console.log(`  Run: npm i -g ${PKG_NAME}@latest\n`);
    }
  }).catch(() => { /* never block on network failure */ });
}

// ── commands ─────────────────────────────────────────────────────────────────

const SKILLS = [
  { value: 'loop-plan', label: 'loop-plan', hint: 'iterative research-driven planner (7-phase)' },
  { value: 'loop-debug', label: 'loop-debug', hint: '7-phase research-driven debugger (requires loop-plan)', requires: 'loop-plan' },
] as const;

const AGENTS = [
  { value: 'spec-reviewer', label: 'spec-reviewer', hint: 'verifies implementation matches spec' },
  { value: 'code-quality-reviewer', label: 'code-quality-reviewer', hint: '11-dimension code quality gate' },
  { value: 'research-agent', label: 'research-agent', hint: '5-step methodology research' },
  { value: 'test-runner', label: 'test-runner', hint: 'runs test suites + mutation testing' },
  { value: 'second-opinion', label: 'second-opinion', hint: 'cross-model Codex review (requires OPENAI_API_KEY)' },
  { value: 'android-kmp-explorer', label: 'android-kmp-explorer', hint: 'Android/KMP codebase exploration' },
  { value: 'swiftui-explorer', label: 'swiftui-explorer', hint: 'iOS/SwiftUI codebase exploration' },
] as const;

type SkillName = (typeof SKILLS)[number]['value'];
type AgentName = (typeof AGENTS)[number]['value'];

interface InstallOptions {
  dryRun: boolean;
  force: boolean;
  skills?: SkillName[];
  agents?: AgentName[];
  noAgents?: boolean;
  noBin?: boolean;
}

async function install(opts: InstallOptions): Promise<void> {
  p.intro('Claude Skills Installer');

  // ── skill selection ──
  let selectedSkills: SkillName[] = opts.skills ?? [];
  if (selectedSkills.length === 0) {
    const answer = await p.multiselect({
      message: 'Which skills do you want to install?',
      options: SKILLS.map(s => ({ value: s.value, label: s.label, hint: s.hint })),
      required: true,
    });
    if (p.isCancel(answer)) { p.cancel('Cancelled.'); process.exit(0); }
    selectedSkills = answer as SkillName[];
  }

  // Dependency guard: loop-debug requires loop-plan
  if (selectedSkills.includes('loop-debug') && !selectedSkills.includes('loop-plan')) {
    p.note('loop-debug references ../loop-plan/references/. loop-plan will be added automatically.');
    selectedSkills = ['loop-plan', ...selectedSkills];
  }

  // ── agent selection ──
  let selectedAgents: AgentName[] = opts.agents ?? [];
  if (!opts.noAgents && selectedAgents.length === 0) {
    const answer = await p.multiselect({
      message: 'Which supporting agents to include?',
      options: AGENTS.map(a => ({ value: a.value, label: a.label, hint: a.hint })),
      required: false,
    });
    if (p.isCancel(answer)) { p.cancel('Cancelled.'); process.exit(0); }
    selectedAgents = (answer ?? []) as AgentName[];
  }

  // ── conflict check ──
  const skillsDir = join(CLAUDE_DIR, 'skills');
  const conflicts: string[] = [];
  for (const skill of selectedSkills) {
    const target = join(skillsDir, skill);
    if (await exists(target)) conflicts.push(skill);
  }

  if (conflicts.length > 0 && !opts.force && !opts.dryRun) {
    const proceed = await p.confirm({
      message: `${conflicts.join(', ')} already installed. Overwrite?`,
    });
    if (p.isCancel(proceed) || !proceed) { p.cancel('Cancelled.'); process.exit(0); }
  }

  // ── build file manifest ──
  const writes: Array<{ from: string; to: string }> = [];
  for (const skill of selectedSkills) {
    writes.push({ from: join(PKG_ROOT, 'skills', skill), to: join(skillsDir, skill) });
  }
  for (const agent of selectedAgents) {
    writes.push({
      from: join(PKG_ROOT, 'agents', `${agent}.md`),
      to: join(CLAUDE_DIR, 'agents', `${agent}.md`),
    });
  }
  if (!opts.noBin) {
    writes.push({ from: join(PKG_ROOT, 'bin'), to: join(CLAUDE_DIR, 'bin') });
    writes.push({ from: join(PKG_ROOT, 'commands'), to: join(CLAUDE_DIR, 'commands') });
  }

  // ── dry-run ──
  if (opts.dryRun) {
    p.note(writes.map(w => `  ${w.from} → ${w.to}`).join('\n'), 'Dry-run — nothing written');
    p.outro('Done (dry-run).');
    return;
  }

  // ── write files ──
  const spinner = p.spinner();
  spinner.start('Installing…');
  const installedFiles: Array<{ path: string; sha256: string }> = [];
  for (const w of writes) {
    await mkdir(dirname(w.to), { recursive: true });
    await cp(w.from, w.to, { recursive: true, force: true });
    spinner.message(`✔ ${w.to}`);
  }

  // chmod +x all bin scripts (.py and .sh)
  const binDir = join(CLAUDE_DIR, 'bin');
  if (!opts.noBin && await exists(binDir)) {
    execSync(`find "${binDir}" -name "*.py" -o -name "*.sh" | xargs chmod +x`);
  }
  spinner.stop('Files installed.');

  // ── collect checksums for receipt ──
  const receiptSpinner = p.spinner();
  receiptSpinner.start('Writing install receipt…');
  const { glob } = await import('node:fs').then(() => import('glob'));
  const allInstalled = await glob('**/*', { cwd: CLAUDE_DIR, nodir: true, dot: true });
  for (const rel of allInstalled.slice(0, 200)) {
    try {
      const abs = join(CLAUDE_DIR, rel);
      installedFiles.push({ path: rel, sha256: await sha256(abs) });
    } catch { /* skip */ }
  }

  const receiptPath = join(skillsDir, '.install-receipt.json');
  await mkdir(skillsDir, { recursive: true });
  await writeFile(receiptPath, JSON.stringify({
    version: VERSION,
    installed_at: new Date().toISOString(),
    skills: selectedSkills,
    agents: selectedAgents,
    files: installedFiles,
  }, null, 2));
  receiptSpinner.stop('Receipt written.');

  p.outro(`Done! Start Claude Code and type /loop-plan to begin.\n  Uninstall: claude-skills uninstall`);

  // Non-blocking update check (fire-and-forget)
  checkUpdate(VERSION);
}

async function updateCommand(): Promise<void> {
  p.intro('Update Check');
  const receiptPath = join(CLAUDE_DIR, 'skills', '.install-receipt.json');
  let installedVersion = 'unknown';
  try {
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
    installedVersion = receipt.version;
  } catch { /* no receipt */ }

  const spinner = p.spinner();
  spinner.start('Checking npm registry…');
  try {
    const res = await fetch(`https://registry.npmjs.org/-/package/${PKG_NAME}/dist-tags`,
      { signal: AbortSignal.timeout(5000) });
    const data = await res.json() as Record<string, string>;
    const latest = data['latest'];
    spinner.stop('Done.');
    if (latest === installedVersion) {
      p.outro(`Already up to date (v${installedVersion}).`);
      return;
    }
    const proceed = await p.confirm({
      message: `Version ${latest} available (installed: ${installedVersion}). Update?`,
    });
    if (p.isCancel(proceed) || !proceed) { p.cancel('Cancelled.'); return; }
    execSync(`npm install -g ${PKG_NAME}@latest`, { stdio: 'inherit' });
    p.outro('Update complete. Re-run claude-skills to install updated skill files.');
  } catch {
    spinner.stop('Could not reach registry.');
    p.outro('Try: npm install -g @loopskills/claude-skills@latest');
  }
}

async function listCommand(): Promise<void> {
  const receiptPath = join(CLAUDE_DIR, 'skills', '.install-receipt.json');
  try {
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
    console.log(`Installed version: ${receipt.version} (${receipt.installed_at})`);
    console.log(`Skills: ${receipt.skills.join(', ')}`);
    console.log(`Agents: ${receipt.agents.join(', ')}`);
  } catch {
    console.log('No install receipt found. Run claude-skills to install.');
  }
}

async function verifyCommand(): Promise<void> {
  const receiptPath = join(CLAUDE_DIR, 'skills', '.install-receipt.json');
  try {
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
    let ok = 0, fail = 0;
    for (const f of (receipt.files as Array<{ path: string; sha256: string }>)) {
      try {
        const actual = await sha256(join(CLAUDE_DIR, f.path));
        if (actual === f.sha256) ok++; else { fail++; console.error(`MODIFIED: ${f.path}`); }
      } catch { fail++; console.error(`MISSING:  ${f.path}`); }
    }
    console.log(`Verify: ${ok} OK, ${fail} changed/missing`);
    process.exit(fail > 0 ? 1 : 0);
  } catch {
    console.error('No install receipt found. Run claude-skills to install first.');
    process.exit(1);
  }
}

async function uninstallCommand(): Promise<void> {
  const { rm } = await import('node:fs/promises');
  const receiptPath = join(CLAUDE_DIR, 'skills', '.install-receipt.json');
  let skills: string[] = [];
  try {
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
    skills = receipt.skills;
  } catch {
    console.error('No install receipt found.');
    process.exit(1);
  }
  const proceed = await p.confirm({ message: `Remove skills: ${skills.join(', ')}?` });
  if (p.isCancel(proceed) || !proceed) { p.cancel('Cancelled.'); return; }
  for (const skill of skills) {
    await rm(join(CLAUDE_DIR, 'skills', skill), { recursive: true, force: true });
  }
  await rm(receiptPath, { force: true });
  console.log('Uninstalled.');
}

// ── CLI entry ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const cmdCandidates = ['update', 'list', 'verify', 'uninstall'];
const cmd = cmdCandidates.includes(args[0] ?? '') ? args[0] : undefined;
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
const noAgents = args.includes('--no-agents');
const noBin = args.includes('--no-bin');

// Parse --skills loop-plan,loop-debug or --skills loop-plan --skills loop-debug
const skillArgs: SkillName[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--skills' && args[i + 1]) {
    skillArgs.push(...(args[i + 1].split(',') as SkillName[]));
    i++;
  }
}

if (cmd === 'update') { await updateCommand(); }
else if (cmd === 'list') { await listCommand(); }
else if (cmd === 'verify') { await verifyCommand(); }
else if (cmd === 'uninstall') { await uninstallCommand(); }
else { await install({ dryRun, force, noAgents, noBin, skills: skillArgs.length > 0 ? skillArgs : undefined }); }
