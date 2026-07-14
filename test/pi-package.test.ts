import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('package declares Pi skills', async () => {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as {
    keywords?: string[];
    pi?: { skills?: string[] };
  };
  assert.ok(pkg.keywords?.includes('pi-package'));
  assert.deepEqual(pkg.pi?.skills, ['./skills/pi']);
});

test('Pi skills are discoverable and do not require Claude-only tools', async () => {
  for (const name of ['loop-plan', 'loop-debug', 'loop-audit']) {
    const path = join(root, 'skills', 'pi', name, 'SKILL.md');
    const text = await readFile(path, 'utf8');
    assert.match(text, new RegExp(`name: ${name}`));
    assert.doesNotMatch(text, /allowed-tools:|AskUserQuestion|ExitPlanMode|subagent-driven-development/);
  }
});
