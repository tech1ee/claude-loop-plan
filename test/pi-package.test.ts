import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('package declares Pi skills', async () => {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as {
    name?: string;
    bin?: Record<string, string>;
    keywords?: string[];
    pi?: { skills?: string[] };
  };
  assert.equal(pkg.name, 'loop-skills');
  assert.equal(pkg.bin?.['loop-skills'], 'dist/src/install.js');
  assert.equal(pkg.bin?.['claude-skills'], 'dist/src/install.js');
  assert.ok(pkg.keywords?.includes('pi-package'));
  assert.deepEqual(pkg.pi?.skills, ['./skills/pi']);
});

test('Pi manifest exposes the progress extension', async () => {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as {
    pi?: { extensions?: string[] };
  };
  assert.deepEqual(pkg.pi?.extensions, [
    './extensions/loop-progress.ts',
    './extensions/loop-inventory.ts',
    './extensions/loop-evidence.ts',
  ]);
  const progress = await readFile(join(root, 'extensions', 'loop-progress.ts'), 'utf8');
  const inventory = await readFile(join(root, 'extensions', 'loop-inventory.ts'), 'utf8');
  const evidence = await readFile(join(root, 'extensions', 'loop-evidence.ts'), 'utf8');
  assert.match(progress, /registerTool\(\{\s*name: "loop_progress"/s);
  assert.match(progress, /setWidget\("loop-progress"/);
  assert.match(inventory, /name: "loop_inventory"/);
  assert.match(evidence, /name: "loop_evidence"/);
});

test('Pi skills are discoverable and do not require Claude-only tools', async () => {
  for (const name of ['loop-plan', 'loop-debug', 'loop-audit']) {
    const path = join(root, 'skills', 'pi', name, 'SKILL.md');
    const text = await readFile(path, 'utf8');
    assert.match(text, new RegExp(`name: ${name}`));
    assert.doesNotMatch(text, /allowed-tools:|AskUserQuestion|ExitPlanMode|subagent-driven-development/);
  }
});
