import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let tmpHome: string;

beforeEach(async () => {
  tmpHome = await mkdtemp(join(tmpdir(), 'loop-skills-codex-'));
});

afterEach(async () => {
  await rm(tmpHome, { recursive: true, force: true });
});

describe('Codex plugin package', () => {
  test('manifest and skill payload are Codex-discoverable', async () => {
    const pluginRoot = join(root, 'plugins', 'loop-skills');
    const manifest = JSON.parse(await readFile(join(pluginRoot, '.codex-plugin', 'plugin.json'), 'utf8')) as {
      name: string;
      version: string;
      skills: string;
    };
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as { version: string; files: string[] };

    assert.equal(manifest.name, 'loop-skills');
    assert.equal(manifest.version, pkg.version);
    assert.equal(manifest.skills, './skills/');
    assert.ok(pkg.files.includes('plugins/'));

    for (const name of ['loop-plan', 'loop-debug', 'loop-audit']) {
      const skill = await readFile(join(pluginRoot, 'skills', name, 'SKILL.md'), 'utf8');
      assert.match(skill, new RegExp(`name: ${name}`));
      assert.doesNotMatch(skill, /~\/.claude|AskUserQuestion|ExitPlanMode|CLAUDE\.md/);
    }
  });

  test('dry-run reports Codex writes without touching HOME', async () => {
    const entryPoint = new URL('../src/install.js', import.meta.url).pathname;
    const { stdout } = await execFileP('node', [entryPoint, 'codex', '--dry-run'], {
      env: { ...process.env, HOME: tmpHome },
    });

    assert.match(stdout, /Codex Plugin Installer/);
    assert.match(stdout, /marketplace\.json/);
    await assert.rejects(readFile(join(tmpHome, '.agents', 'plugins', 'marketplace.json')));
  });

  test('installer stages plugin and merges the personal marketplace', async () => {
    const entryPoint = new URL('../src/install.js', import.meta.url).pathname;
    await execFileP('node', [entryPoint, 'codex', '--force', '--no-enable'], {
      env: { ...process.env, HOME: tmpHome },
    });

    const installedManifest = JSON.parse(await readFile(
      join(tmpHome, 'plugins', 'loop-skills', '.codex-plugin', 'plugin.json'),
      'utf8',
    )) as { name: string };
    assert.equal(installedManifest.name, 'loop-skills');

    const marketplace = JSON.parse(await readFile(
      join(tmpHome, '.agents', 'plugins', 'marketplace.json'),
      'utf8',
    )) as { name: string; plugins: Array<{ name: string; source: { path: string } }> };
    assert.equal(marketplace.name, 'personal');
    assert.deepEqual(marketplace.plugins, [{
      name: 'loop-skills',
      source: { source: 'local', path: './plugins/loop-skills' },
      policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
      category: 'Developer Tools',
    }]);
  });

  test('installer preserves unrelated marketplace entries and root metadata', async () => {
    const marketplacePath = join(tmpHome, '.agents', 'plugins', 'marketplace.json');
    await mkdir(dirname(marketplacePath), { recursive: true });
    await writeFile(marketplacePath, JSON.stringify({
      name: 'my-tools',
      interface: { displayName: 'My Tools', accent: 'violet' },
      owner: 'local-user',
      plugins: [{
        name: 'existing-plugin',
        source: { source: 'local', path: './plugins/existing-plugin' },
        policy: { installation: 'INSTALLED_BY_DEFAULT', authentication: 'ON_USE' },
        category: 'Productivity',
      }],
    }));

    const entryPoint = new URL('../src/install.js', import.meta.url).pathname;
    await execFileP('node', [entryPoint, 'codex', '--force', '--no-enable'], {
      env: { ...process.env, HOME: tmpHome },
    });

    const marketplace = JSON.parse(await readFile(marketplacePath, 'utf8')) as {
      name: string;
      interface: { displayName: string; accent: string };
      owner: string;
      plugins: Array<{ name: string }>;
    };
    assert.equal(marketplace.name, 'my-tools');
    assert.deepEqual(marketplace.interface, { displayName: 'My Tools', accent: 'violet' });
    assert.equal(marketplace.owner, 'local-user');
    assert.deepEqual(marketplace.plugins.map(entry => entry.name), ['existing-plugin', 'loop-skills']);
  });

  test('forced reinstall removes stale files from the previous plugin payload', async () => {
    const pluginRoot = join(tmpHome, 'plugins', 'loop-skills');
    await mkdir(pluginRoot, { recursive: true });
    await writeFile(join(pluginRoot, 'stale-file.txt'), 'must not survive an upgrade');

    const entryPoint = new URL('../src/install.js', import.meta.url).pathname;
    await execFileP('node', [entryPoint, 'codex', '--force', '--no-enable'], {
      env: { ...process.env, HOME: tmpHome },
    });

    await assert.rejects(readFile(join(pluginRoot, 'stale-file.txt')));
  });

  test('installer can stage only the selected Codex workflows', async () => {
    const entryPoint = new URL('../src/install.js', import.meta.url).pathname;
    await execFileP('node', [
      entryPoint,
      'codex',
      '--force',
      '--no-enable',
      '--skills',
      'loop-audit',
    ], {
      env: { ...process.env, HOME: tmpHome },
    });

    const skillsRoot = join(tmpHome, 'plugins', 'loop-skills', 'skills');
    assert.match(await readFile(join(skillsRoot, 'loop-audit', 'SKILL.md'), 'utf8'), /name: loop-audit/);
    await assert.rejects(readFile(join(skillsRoot, 'loop-plan', 'SKILL.md')));
    await assert.rejects(readFile(join(skillsRoot, 'loop-debug', 'SKILL.md')));
  });

  test('selecting loop-debug automatically includes its loop-plan dependency', async () => {
    const entryPoint = new URL('../src/install.js', import.meta.url).pathname;
    const { stdout } = await execFileP('node', [
      entryPoint,
      'codex',
      '--force',
      '--no-enable',
      '--skills',
      'loop-debug',
    ], {
      env: { ...process.env, HOME: tmpHome },
    });

    const skillsRoot = join(tmpHome, 'plugins', 'loop-skills', 'skills');
    assert.match(stdout, /loop-plan will be added automatically/);
    assert.match(await readFile(join(skillsRoot, 'loop-plan', 'SKILL.md'), 'utf8'), /name: loop-plan/);
    assert.match(await readFile(join(skillsRoot, 'loop-debug', 'SKILL.md'), 'utf8'), /name: loop-debug/);
    await assert.rejects(readFile(join(skillsRoot, 'loop-audit', 'SKILL.md')));
  });
});
