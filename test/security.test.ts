import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { buildDemoPipeline } from '../src/index.js';

const FORBIDDEN = /seed|mnemonic|private.?key|password|passphrase|secret|withdraw|api.?key/i;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith('.ts') ? [path] : [];
  });
}

function collectKeys(value: unknown, keys: Set<string>): Set<string> {
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      keys.add(key);
      collectKeys(child, keys);
    }
  }
  return keys;
}

describe('No credential fields in the domain', () => {
  test('source contains no seed, private key, password, secret or withdrawal identifiers', () => {
    const files = sourceFiles(join(process.cwd(), 'src'));
    assert.ok(files.length > 0);
    const offenders = files.flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, i) => ({ file, line: i + 1, text: line }))
        .filter(({ text }) => FORBIDDEN.test(text)),
    );
    assert.deepEqual(offenders, []);
  });

  test('runtime contract objects carry no credential fields', () => {
    const { ledger, engine, ...contracts } = buildDemoPipeline();
    const keys = collectKeys({ ...contracts, records: ledger.records() }, new Set());
    assert.ok(keys.size > 20);
    assert.deepEqual([...keys].filter((k) => FORBIDDEN.test(k)), []);
    assert.equal(engine.mode, 'PAPER');
  });
});
