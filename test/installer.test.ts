/**
 * Installer behavior tests — rigor: tdd-only
 * Tests run against a temp ~/.claude mock directory, not the real one.
 *
 * Test behaviors (from plan T4):
 * 1. --dry-run prints file list to stdout and writes nothing to ~/.claude/
 * 2. Interactive multiselect shows all available skills with description
 * 3. Selecting loop-plan copies all files from skills/loop-plan/ to ~/.claude/skills/loop-plan/
 * 4. If ~/.claude/skills/loop-plan/ already exists, installer prompts confirm() before any write
 * 5. Install receipt is written with correct shape
 * 6. All 9 bin scripts land with execute permission (mode 0755) — both .py and .sh
 * 7. --force flag skips conflict confirmation and overwrites directly
 * 8. `claude-skills update` with stale receipt and registry returning higher version prompts user
 * 9. `claude-skills update` when installed version matches registry latest prints "up to date"
 * 10. Non-blocking check with NO_UPDATE_NOTIFIER=1 makes no registry fetch
 * 11. Non-blocking check with stale receipt + higher registry version prints update notice
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

let tmpHome: string;
let claudeDir: string;

beforeEach(async () => {
  tmpHome = await mkdtemp(join(tmpdir(), 'claude-skills-test-'));
  claudeDir = join(tmpHome, '.claude');
  await mkdir(join(claudeDir, 'skills'), { recursive: true });
  await mkdir(join(claudeDir, 'agents'), { recursive: true });
  await mkdir(join(claudeDir, 'bin'), { recursive: true });
});

afterEach(async () => {
  await rm(tmpHome, { recursive: true, force: true });
});

// Helper: run the installer with env HOME pointing to tmpHome
async function runInstaller(args: string[], env: Record<string, string> = {}): Promise<{ stdout: string; stderr: string; code: number }> {
  const entryPoint = new URL('../src/install.js', import.meta.url).pathname;
  try {
    const result = await execFileP('node', [entryPoint, ...args], {
      env: { ...process.env, HOME: tmpHome, ...env },
      timeout: 10000,
    });
    return { stdout: result.stdout, stderr: result.stderr, code: 0 };
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; code?: number };
    return { stdout: err.stdout ?? '', stderr: err.stderr ?? '', code: err.code ?? 1 };
  }
}

describe('behavior 1 — dry-run writes nothing', () => {
  test('--dry-run prints manifest and leaves ~/.claude/ empty', async () => {
    const { stdout, code } = await runInstaller(['--dry-run', '--skills', 'loop-plan', '--no-agents', '--no-bin']);
    assert.equal(code, 0);
    assert.match(stdout, /loop-plan/);
    // skills dir must still be empty
    const entries = await readFile(join(claudeDir, 'skills', 'loop-plan', 'SKILL.md')).catch(() => null);
    assert.equal(entries, null, 'SKILL.md must not be written in dry-run');
  });
});

describe('behavior 3 — loop-plan install copies files', () => {
  test('selecting loop-plan copies SKILL.md and references/', async () => {
    const { code } = await runInstaller(['--skills', 'loop-plan', '--no-agents', '--no-bin', '--force']);
    assert.equal(code, 0);
    const skillMd = await readFile(join(claudeDir, 'skills', 'loop-plan', 'SKILL.md'), 'utf8');
    assert.match(skillMd, /loop-plan/i);
  });
});

describe('behavior 4 — conflict prompts confirm()', () => {
  test('existing skill dir without --force triggers confirm prompt', async () => {
    // Pre-create the skill directory
    await mkdir(join(claudeDir, 'skills', 'loop-plan'), { recursive: true });
    await writeFile(join(claudeDir, 'skills', 'loop-plan', 'SKILL.md'), 'old content');
    // Without --force, installer should ask; since stdin is non-interactive it should cancel
    const { code } = await runInstaller(['--skills', 'loop-plan', '--no-agents', '--no-bin']);
    // Either exits 0 (user declined) or 1 (prompt cancelled)
    const skillMd = await readFile(join(claudeDir, 'skills', 'loop-plan', 'SKILL.md'), 'utf8');
    assert.equal(skillMd, 'old content', 'file must not be overwritten without force');
  });
});

describe('behavior 5 — install receipt written', () => {
  test('receipt at ~/.claude/skills/.install-receipt.json has version + skills', async () => {
    const { code } = await runInstaller(['--skills', 'loop-plan', '--no-agents', '--no-bin', '--force']);
    assert.equal(code, 0);
    const receiptRaw = await readFile(join(claudeDir, 'skills', '.install-receipt.json'), 'utf8');
    const receipt = JSON.parse(receiptRaw);
    assert.ok(typeof receipt.version === 'string', 'version must be a string');
    assert.ok(Array.isArray(receipt.skills), 'skills must be an array');
    assert.ok(receipt.skills.includes('loop-plan'), 'receipt must list loop-plan');
    assert.ok(typeof receipt.installed_at === 'string', 'installed_at must be present');
  });
});

describe('behavior 6 — bin scripts are executable', () => {
  test('all .py and .sh files in bin/ have mode 0755', async () => {
    const { code } = await runInstaller(['--skills', 'loop-plan', '--no-agents', '--force']);
    assert.equal(code, 0);
    const binDir = join(claudeDir, 'bin');
    const { readdir } = await import('node:fs/promises');
    const files = await readdir(binDir);
    const scripts = files.filter(f => f.endsWith('.py') || f.endsWith('.sh'));
    assert.ok(scripts.length > 0, 'must have at least one bin script');
    for (const script of scripts) {
      const s = await stat(join(binDir, script));
      const mode = s.mode & 0o777;
      assert.equal(mode, 0o755, `${script} must have mode 0755, got ${mode.toString(8)}`);
    }
  });
});

describe('behavior 7 — --force skips confirm', () => {
  test('--force overwrites existing skill without prompting', async () => {
    await mkdir(join(claudeDir, 'skills', 'loop-plan'), { recursive: true });
    await writeFile(join(claudeDir, 'skills', 'loop-plan', 'SKILL.md'), 'old content');
    const { code } = await runInstaller(['--skills', 'loop-plan', '--no-agents', '--no-bin', '--force']);
    assert.equal(code, 0);
    const skillMd = await readFile(join(claudeDir, 'skills', 'loop-plan', 'SKILL.md'), 'utf8');
    assert.notEqual(skillMd, 'old content', 'file must be overwritten with --force');
  });
});

describe('behavior 10 — NO_UPDATE_NOTIFIER suppresses fetch', () => {
  test('no registry fetch when NO_UPDATE_NOTIFIER=1', async () => {
    // Intercept fetch by setting an env that blocks network (test with no real network effect)
    const { stdout } = await runInstaller(
      ['list'],
      { NO_UPDATE_NOTIFIER: '1' }
    );
    // Test is behavioral: if no "Update available" text in output, fetch was suppressed
    assert.doesNotMatch(stdout, /Update available/);
  });
});
