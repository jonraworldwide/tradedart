import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { makePaperPreview } from '../src/app/paper-preview.js';

describe('Paper Lab read model', () => {
  test('renders engine-derived cases without treating fixture capital as a connected account', () => {
    const preview = makePaperPreview();
    assert.equal(preview.mode, 'PAPER');
    assert.equal(preview.liveExecutionEnabled, false);
    assert.equal(preview.source, 'DETERMINISTIC_FIXTURE');
    assert.deepEqual(preview.scenarios.map((row) => [row.id, row.outcome, row.reason]), [
      ['capacity', 'REJECT', 'BELOW_MIN_NOTIONAL'],
      ['daily', 'REJECT', 'DAILY_DRAWDOWN_LIMIT'],
      ['total', 'REJECT', 'TOTAL_DRAWDOWN_LIMIT'],
      ['approved', 'PASS', 'ALL_CHECKS_PASSED'],
    ]);
    assert.equal(preview.scenarios[0]?.maxNotionalQuote, 4.33);
    assert.ok(preview.scenarios[0]?.trace.some((line) => line.includes('$3.14')));
    assert.ok(preview.scenarios[1]?.trace.some((line) => line.includes('3.01%')));
  });

  test('static UI labels the cases as fixtures and drops fabricated connected balances', () => {
    const html = readFileSync(join(process.cwd(), 'public', 'index.html'), 'utf8');
    const generated = readFileSync(join(process.cwd(), 'public', 'paper-preview.js'), 'utf8');
    assert.match(html, /SIMULATED · FIXED FIXTURE · NOT YOUR ACCOUNT/);
    assert.match(html, /data-view="Paper Lab"/);
    assert.match(html, /No account connected/);
    assert.doesNotMatch(html, /\$42,840|\$8,600|\+\$1,284/);
    assert.equal(JSON.parse(generated.replace(/^window\.TRADEDART_PAPER_PREVIEW = /, '').trim().replace(/;$/, '')).scenarios.length, 4);
  });
});
