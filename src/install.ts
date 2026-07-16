#!/usr/bin/env node
import * as p from '@clack/prompts';
import { groupMultiselect } from '@clack/prompts';
import { cp, chmod, mkdir, readFile, writeFile, access, readdir, rename, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
// In dist/src/install.js; project root is two levels up
const PKG_ROOT = join(__dirname, '../..');
const CLAUDE_DIR = join(homedir(), '.claude');
const CODEX_PLUGIN_NAME = 'loop-skills';
const CODEX_PLUGIN_SOURCE = join(PKG_ROOT, 'plugins', CODEX_PLUGIN_NAME);
const CODEX_PLUGIN_DIR = join(homedir(), 'plugins', CODEX_PLUGIN_NAME);
const CODEX_MARKETPLACE_PATH = join(homedir(), '.agents', 'plugins', 'marketplace.json');
const VERSION = JSON.parse(
  await readFile(join(PKG_ROOT, 'package.json'), 'utf8')
).version as string;
const PKG_NAME = 'loop-skills';

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

const CODEX_SKILLS = [
  { value: 'loop-plan', label: 'loop-plan', hint: 'research, plan, implement, and verify non-trivial changes' },
  { value: 'loop-debug', label: 'loop-debug', hint: 'reproduce, diagnose, fix, and prevent bugs (requires loop-plan)' },
  { value: 'loop-audit', label: 'loop-audit', hint: 'audit skills, plugins, hooks, MCP, and agent workflows' },
] as const;

const AGENT_GROUPS = {
  'Universal': [
    { value: 'loop-verifier',                      hint: 'goal-backward adversarial verifier (stage gates)' },
    { value: 'test-writer',                        hint: 'separate TDD test author — anti-cheating separation of duties' },
    { value: 'spec-reviewer',                      hint: 'spec compliance gate (Phase 7)' },
    { value: 'code-quality-reviewer',              hint: '11-dimension quality sweep (Phase 7)' },
    { value: 'research-agent',                     hint: 'library docs + best practices (Phase 3)' },
    { value: 'test-runner',                        hint: 'multi-framework test executor (Phase 7)' },
    { value: 'second-opinion',                     hint: 'cross-model Codex review (requires OPENAI_API_KEY)' },
    { value: 'security-reviewer',                  hint: 'auth / injection / secrets audit' },
    { value: 'srp-godclass-auditor',               hint: 'God-class + LCOM4 detector' },
    { value: 'dry-duplication-auditor',            hint: 'Rule-of-Three duplication gate' },
    { value: 'complexity-long-method-auditor',     hint: 'cyclomatic + cognitive complexity' },
    { value: 'dip-dependency-direction-auditor',   hint: 'import cycles + layer violations' },
    { value: 'naming-conventions-auditor',         hint: 'naming smell detector' },
    { value: 'comment-quality-auditor',            hint: 'comment hygiene (WHAT vs WHY)' },
    { value: 'yagni-premature-abstraction-auditor', hint: 'speculative-generality detector' },
    { value: 'char-test-coverage-auditor',         hint: 'pre-refactor coverage gate' },
    { value: 'adr-completeness-auditor',           hint: 'MADR 4.0.0 schema completeness' },
  ],
  'Android / KMP': [
    { value: 'android-kmp-explorer',               hint: 'Android/KMP/Compose codebase exploration' },
    { value: 'android-coroutine-scope-leak-auditor', hint: 'GlobalScope / viewModelScope leaks' },
    { value: 'android-fgs-compliance-auditor',     hint: 'FGS Android 14/15 compliance' },
    { value: 'android-r8-proguard-auditor',        hint: 'R8/ProGuard AGP 9 keep-rule audit' },
    { value: 'android-baseline-profile-checklister', hint: 'Baseline Profile setup completeness' },
  ],
  'iOS / macOS': [
    { value: 'swiftui-explorer',                   hint: 'iOS/SwiftUI codebase exploration' },
    { value: 'ios-appstore-preflight-auditor',     hint: 'PrivacyInfo + Required Reason API preflight' },
    { value: 'ios-codable-edge-auditor',           hint: 'Codable semantic edge cases' },
    { value: 'ios-coredata-migration-auditor',     hint: 'Core Data migration eligibility' },
    { value: 'kmp-bridging-topology-auditor',      hint: 'KMP source-set topology audit' },
    { value: 'kmp-swift-interop-readiness-auditor', hint: 'SKIE / Swift Export readiness' },
    { value: 'macos-entitlements-distribution-auditor', hint: 'entitlement / sandbox consistency' },
    { value: 'macos-notarization-preflight-auditor',    hint: 'notarytool CI pre-flight' },
    { value: 'macos-appkit-swiftui-interop-auditor',    hint: 'NSViewRepresentable seam audit' },
  ],
  'Architecture': [
    { value: 'compose-architect',                  hint: 'Compose UI architecture + MVVM design' },
    { value: 'datalayer-architect',                hint: 'KMP data layer — repos, Ktor, Room, Koin' },
  ],
  'React / Next.js': [
    { value: 'react-nextjs-explorer',              hint: 'React/Next.js/TypeScript codebase exploration' },
    { value: 'react-hooks-misuse-auditor',         hint: 'stale closures, missing deps, conditional hooks' },
    { value: 'nextjs-rsc-boundary-auditor',        hint: 'RSC vs client boundaries, data-fetch waterfalls' },
  ],
  'TypeScript / Node.js': [
    { value: 'typescript-strict-mode-auditor',     hint: 'any creep, unsafe casts, @ts-ignore usage' },
    { value: 'nodejs-async-safety-auditor',        hint: 'unhandled rejections, blocking event loop' },
  ],
  'Python': [
    { value: 'python-async-correctness-auditor',   hint: 'blocking calls in async context, asyncio pitfalls' },
    { value: 'django-fastapi-safety-auditor',      hint: 'migration safety, cascade risks, N+1 queries' },
  ],
  'Vue / Nuxt': [
    { value: 'vue-reactivity-pitfalls-auditor',    hint: 'destructured state loss, watch cleanup, computed SE' },
    { value: 'nuxt-ssr-hydration-auditor',         hint: 'SSR/CSR hydration mismatches, server-guard misuse' },
  ],
} as const satisfies Record<string, Array<{ value: string; hint: string }>>;

type AgentGroupName = keyof typeof AGENT_GROUPS;
type AgentName = (typeof AGENT_GROUPS)[AgentGroupName][number]['value'];

// Add label field derived from value for groupMultiselect display
const AGENT_GROUPS_DISPLAY = Object.fromEntries(
  Object.entries(AGENT_GROUPS).map(([group, agents]) => [
    group,
    (agents as ReadonlyArray<{ value: string; hint: string }>).map(a => ({
      value: a.value,
      label: a.value,
      hint: a.hint,
    })),
  ])
) as Record<AgentGroupName, Array<{ value: string; label: string; hint: string }>>;

type SkillName = (typeof SKILLS)[number]['value'];
type CodexSkillName = (typeof CODEX_SKILLS)[number]['value'];

interface InstallOptions {
  dryRun: boolean;
  force: boolean;
  skills?: SkillName[];
  agents?: AgentName[];
  noAgents?: boolean;
  noBin?: boolean;
}

interface MarketplaceEntry {
  name: string;
  source: { source: 'local'; path: string };
  policy: { installation: 'AVAILABLE'; authentication: 'ON_INSTALL' };
  category: string;
}

interface MarketplaceFile {
  name: string;
  interface?: { displayName?: string; [key: string]: unknown };
  plugins: MarketplaceEntry[];
  [key: string]: unknown;
}

async function installCodexPlugin(opts: {
  dryRun: boolean;
  force: boolean;
  noEnable: boolean;
  skills?: CodexSkillName[];
}): Promise<void> {
  p.intro('Loop Skills — Codex Plugin Installer');

  let selectedSkills = opts.skills ?? [];
  if (selectedSkills.length === 0) {
    if (process.stdin.isTTY) {
      const answer = await p.multiselect({
        message: 'Which Codex workflows do you want to install?',
        options: CODEX_SKILLS.map(skill => ({
          value: skill.value,
          label: skill.label,
          hint: skill.hint,
        })),
        initialValues: CODEX_SKILLS.map(skill => skill.value),
        required: true,
      });
      if (p.isCancel(answer)) { p.cancel('Cancelled.'); return; }
      selectedSkills = answer as CodexSkillName[];
    } else {
      selectedSkills = CODEX_SKILLS.map(skill => skill.value);
    }
  }

  if (selectedSkills.includes('loop-debug') && !selectedSkills.includes('loop-plan')) {
    p.note('loop-debug uses loop-plan references. loop-plan will be added automatically.');
    selectedSkills = ['loop-plan', ...selectedSkills];
  }

  let marketplace: MarketplaceFile = {
    name: 'personal',
    interface: { displayName: 'Personal' },
    plugins: [],
  };
  if (await exists(CODEX_MARKETPLACE_PATH)) {
    try {
      const parsed = JSON.parse(await readFile(CODEX_MARKETPLACE_PATH, 'utf8')) as Partial<MarketplaceFile>;
      if (!parsed.name || !Array.isArray(parsed.plugins)) {
        throw new Error('expected top-level name and plugins[]');
      }
      marketplace = parsed as MarketplaceFile;
    } catch (err) {
      console.error(`Invalid personal marketplace at ${CODEX_MARKETPLACE_PATH}`);
      console.error(`Reason: ${(err as Error).message}`);
      process.exit(1);
    }
  }

  const existingIndex = marketplace.plugins.findIndex(entry => entry.name === CODEX_PLUGIN_NAME);
  const conflicts = [
    await exists(CODEX_PLUGIN_DIR) ? CODEX_PLUGIN_DIR : null,
    existingIndex >= 0 ? `${CODEX_PLUGIN_NAME} entry in ${CODEX_MARKETPLACE_PATH}` : null,
  ].filter((value): value is string => value !== null);

  if (conflicts.length > 0 && !opts.force && !opts.dryRun) {
    const proceed = await p.confirm({
      message: `Codex installation already exists (${conflicts.join(', ')}). Replace it?`,
    });
    if (p.isCancel(proceed) || !proceed) { p.cancel('Cancelled.'); return; }
  }

  const entry: MarketplaceEntry = {
    name: CODEX_PLUGIN_NAME,
    source: { source: 'local', path: `./plugins/${CODEX_PLUGIN_NAME}` },
    policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
    category: 'Developer Tools',
  };

  if (opts.dryRun) {
    p.note([
      `  ${CODEX_PLUGIN_SOURCE} → ${CODEX_PLUGIN_DIR}`,
      `  workflows: ${selectedSkills.join(', ')}`,
      `  add ${CODEX_PLUGIN_NAME} to ${CODEX_MARKETPLACE_PATH}`,
      opts.noEnable ? '  leave plugin staged but disabled' : `  codex plugin add ${CODEX_PLUGIN_NAME}@${marketplace.name}`,
    ].join('\n'), 'Dry-run — nothing written');
    p.outro('Done (dry-run).');
    return;
  }

  if (!await exists(CODEX_PLUGIN_SOURCE)) {
    console.error(`Codex plugin payload is missing: ${CODEX_PLUGIN_SOURCE}`);
    process.exit(1);
  }

  const spinner = p.spinner();
  spinner.start('Installing Codex plugin…');
  await mkdir(dirname(CODEX_PLUGIN_DIR), { recursive: true });
  const stagingDir = `${CODEX_PLUGIN_DIR}.tmp-${process.pid}-${Date.now()}`;
  try {
    await cp(CODEX_PLUGIN_SOURCE, stagingDir, { recursive: true, force: true });
    for (const skill of CODEX_SKILLS) {
      if (!selectedSkills.includes(skill.value)) {
        await rm(join(stagingDir, 'skills', skill.value), { recursive: true, force: true });
      }
    }
    await rm(CODEX_PLUGIN_DIR, { recursive: true, force: true });
    await rename(stagingDir, CODEX_PLUGIN_DIR);
  } catch (err) {
    await rm(stagingDir, { recursive: true, force: true });
    spinner.stop('Could not install the Codex plugin payload.');
    throw err;
  }

  if (existingIndex >= 0) marketplace.plugins[existingIndex] = entry;
  else marketplace.plugins.push(entry);
  marketplace.interface ??= { displayName: 'Personal' };
  marketplace.interface.displayName ??= 'Personal';

  await mkdir(dirname(CODEX_MARKETPLACE_PATH), { recursive: true });
  await writeFile(CODEX_MARKETPLACE_PATH, `${JSON.stringify(marketplace, null, 2)}\n`);
  spinner.stop('Plugin files and personal marketplace entry installed.');

  if (opts.noEnable) {
    p.outro(`Plugin staged. Enable it with: codex plugin add ${CODEX_PLUGIN_NAME}@${marketplace.name}`);
    return;
  }

  try {
    execFileSync('codex', ['plugin', 'add', `${CODEX_PLUGIN_NAME}@${marketplace.name}`], { stdio: 'inherit' });
    p.outro(`Loop Skills is enabled with ${selectedSkills.join(', ')}. Start a new Codex thread to use the installed workflows.`);
  } catch {
    p.outro(`Plugin files are installed, but automatic enablement failed. Run: codex plugin add ${CODEX_PLUGIN_NAME}@${marketplace.name}`);
  }
}

async function install(opts: InstallOptions): Promise<void> {
  p.intro('Loop Skills Installer');

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
    const answer = await groupMultiselect({
      message: 'Which agents to include? (groups shown — select any across groups)',
      options: AGENT_GROUPS_DISPLAY,
      required: false,
    });
    if (p.isCancel(answer)) { p.cancel('Cancelled.'); process.exit(0); }
    selectedAgents = ((answer as string[]) ?? []) as AgentName[];
  }

  // ── conflict check ──
  const skillsDir = join(CLAUDE_DIR, 'skills');
  const conflicts: string[] = [];
  for (const skill of selectedSkills) {
    const target = join(skillsDir, skill);
    if (await exists(target)) conflicts.push(skill);
  }
  for (const agent of selectedAgents) {
    const target = join(CLAUDE_DIR, 'agents', `${agent}.md`);
    if (await exists(target)) conflicts.push(agent);
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
    try {
      await cp(w.from, w.to, { recursive: true, force: true });
    } catch (err) {
      spinner.stop(`Error installing ${w.from}`);
      console.error(`\nFailed to copy:\n  from: ${w.from}\n  to:   ${w.to}`);
      console.error(`Reason: ${(err as NodeJS.ErrnoException).message}`);
      process.exit(1);
    }
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
  const allInstalled = await (async function walk(dir: string, base: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    const files: string[] = [];
    for (const e of entries) {
      const rel = base ? `${base}/${e.name}` : e.name;
      if (e.isDirectory()) files.push(...await walk(join(dir, e.name), rel));
      else files.push(rel);
    }
    return files;
  })(CLAUDE_DIR, '');
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

  p.outro(`Done! Start Pi or Claude Code and type /loop-plan to begin.\n  Uninstall: loop-skills uninstall`);

  // Non-blocking update check (fire-and-forget)
  checkUpdate(VERSION);
}

async function initCommand(): Promise<void> {
  p.intro('Loop Skills — Project Init');

  const cwd = process.cwd();
  const hasGit = await exists(join(cwd, '.git'));
  const hasClaudeDir = await exists(join(cwd, '.claude'));
  const hasCLAUDEmd = await exists(join(cwd, '.claude', 'CLAUDE.md'));
  const hasContextMd = await exists(join(cwd, 'CONTEXT.md'));
  const hasDecisions = await exists(join(cwd, '.claude', 'decisions'));
  const hasDocs = await exists(join(cwd, 'docs'));

  const isEmpty = !hasGit || (!hasClaudeDir && !hasContextMd && !hasDocs);

  if (isEmpty) {
    p.note('Empty or fresh project detected. Scaffolding foundation…', 'Init');
  } else {
    const missing = [
      !hasCLAUDEmd && '.claude/CLAUDE.md',
      !hasContextMd && 'CONTEXT.md',
      !hasDecisions && '.claude/decisions/',
    ].filter((x): x is string => Boolean(x));
    if (missing.length === 0) {
      p.outro('Project already has a complete foundation. Nothing to init.');
      return;
    }
    p.note(`Existing project. Missing: ${missing.join(', ')}`, 'Init');
  }

  const proceed = await p.confirm({ message: 'Scaffold missing files?' });
  if (p.isCancel(proceed) || !proceed) { p.cancel('Cancelled.'); return; }

  const spinner = p.spinner();
  spinner.start('Scaffolding…');

  if (!hasCLAUDEmd) {
    await mkdir(join(cwd, '.claude'), { recursive: true });
    await cp(
      join(PKG_ROOT, 'templates', 'CLAUDE.md.template'),
      join(cwd, '.claude', 'CLAUDE.md')
    );
    spinner.message('✔ .claude/CLAUDE.md');
  }

  if (!hasDecisions) {
    await mkdir(join(cwd, '.claude', 'decisions'), { recursive: true });
    await cp(
      join(PKG_ROOT, 'templates', 'decisions', 'INDEX.md.template'),
      join(cwd, '.claude', 'decisions', 'INDEX.md')
    );
    spinner.message('✔ .claude/decisions/INDEX.md');
  }

  if (!hasContextMd) {
    await cp(join(PKG_ROOT, 'templates', 'CONTEXT.md.template'), join(cwd, 'CONTEXT.md'));
    spinner.message('✔ CONTEXT.md');
  }

  if (!hasDocs) {
    await mkdir(join(cwd, 'docs'), { recursive: true });
    spinner.message('✔ docs/');
  }

  spinner.stop('Foundation scaffolded.');
  p.outro('Run loop-skills to install loop-plan + agents, then open a new Pi or Claude Code session.');
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
    p.outro('Update complete. Re-run loop-skills to install updated skill files.');
  } catch {
    spinner.stop('Could not reach registry.');
    p.outro('Try: npm install -g loop-skills@latest');
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
    console.log('No install receipt found. Run loop-skills to install.');
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
    console.error('No install receipt found. Run loop-skills to install first.');
    process.exit(1);
  }
}

async function uninstallCommand(): Promise<void> {
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
const cmdCandidates = ['update', 'list', 'verify', 'uninstall', 'init', 'codex', 'install-codex'];
const cmd = cmdCandidates.includes(args[0] ?? '') ? args[0] : undefined;
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
const noAgents = args.includes('--no-agents');
const noBin = args.includes('--no-bin');
const noEnable = args.includes('--no-enable');

// Parse --skills loop-plan,loop-debug or --skills loop-plan --skills loop-debug.
// The Codex plugin supports loop-audit in addition to the Claude Code skills.
const allowedSkillNames = new Set<string>(
  (cmd === 'codex' || cmd === 'install-codex' ? CODEX_SKILLS : SKILLS).map(skill => skill.value),
);
const rawSkillArgs: string[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--skills' && args[i + 1]) {
    const names = args[i + 1].split(',').map(s => s.trim()).filter(Boolean);
    const invalid = names.filter(n => !allowedSkillNames.has(n));
    if (invalid.length > 0) {
      console.error(`Unknown skill(s): ${invalid.join(', ')}`);
      console.error(`Available: ${[...allowedSkillNames].join(', ')}`);
      process.exit(1);
    }
    rawSkillArgs.push(...names);
    i++;
  }
}

// Parse --agents spec-reviewer,research-agent or --agents spec-reviewer --agents research-agent
const ALL_AGENT_NAMES = new Set<string>(
  (Object.values(AGENT_GROUPS) as ReadonlyArray<ReadonlyArray<{ value: string }>>)
    .flatMap(g => g.map(a => a.value))
);
const agentArgs: AgentName[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--agents' && args[i + 1]) {
    const names = args[i + 1].split(',').map(s => s.trim()).filter(Boolean);
    const invalid = names.filter(n => !ALL_AGENT_NAMES.has(n));
    if (invalid.length > 0) {
      console.error(`Unknown agent(s): ${invalid.join(', ')}`);
      console.error(`Run without --agents to see the interactive picker, or check docs/agents/index.md`);
      process.exit(1);
    }
    agentArgs.push(...(names as AgentName[]));
    i++;
  }
}

if (cmd === 'update') { await updateCommand(); }
else if (cmd === 'list') { await listCommand(); }
else if (cmd === 'verify') { await verifyCommand(); }
else if (cmd === 'uninstall') { await uninstallCommand(); }
else if (cmd === 'init') { await initCommand(); }
else if (cmd === 'codex' || cmd === 'install-codex') {
  await installCodexPlugin({
    dryRun,
    force,
    noEnable,
    skills: rawSkillArgs.length > 0 ? rawSkillArgs as CodexSkillName[] : undefined,
  });
}
else {
  await install({
    dryRun,
    force,
    noAgents,
    noBin,
    skills: rawSkillArgs.length > 0 ? rawSkillArgs as SkillName[] : undefined,
    agents: agentArgs.length > 0 ? agentArgs : undefined,
  });
}
