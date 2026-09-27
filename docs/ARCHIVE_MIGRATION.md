# Archive migration ledger — 2026-09-26

Canonical target: `jonraworldwide/tradedart` TypeScript main. Source archives are preserved independently. This ledger records an inspected, bounded foundation slice and does not certify the archived LIVE paths.

| Archive / feature | Archived source | Canonical target and evidence | Verdict |
| --- | --- | --- | --- |
| September v1.1.5, portfolio sizing | `src/risk/portfolio.py`, `src/runtime/automation.py` | `src/layers/risk.ts`, `src/layers/paper-portfolio.ts`; `test/paper-risk.test.ts` | Pure equity/stop/notional gates reimplemented for PAPER; venue adapters and archival LIVE not ported |
| September v1.1.5, daily live loss freeze | `src/runtime/automation.py:reconcile_live_state` | `updatePaperRisk` has daily anchor, pause reason/equity/time, next UTC day reset; zero-equity and restart checkpoint tests | PAPER pure checkpoint verified; persistence service not yet implemented |
| September v1.1.5, heuristic selector | `src/strategies/engine.py` | `src/layers/legacy-momentum.ts` behind explicit `StrategyRegistry`; thesis-linked signal and common constructors | One directional heuristic implemented as paper comparator; not a validated edge and no shorting/venue divergence migrated |
| September v1.1.5, venue-minimum preflight | `src/exchanges/ccxt_gateway.py`, `src/runtime/automation.py` | `sizePaperOrder` rejects below configured minimum without increasing risk | Pure paper gate verified; per-market exchange rules not yet sourced on canonical M2 |
| September v1.1.5, runtime/UI | `static/index.html`, `src/runtime/service.py` | Future M7 operator UI | Not migrated; Python ZIP remains separate |
| July v6.5.0 | Separate Python archive | Awaiting file-by-file S0 manifest and fixtures | Not reviewed in this slice |

Lineage evidence: canonical baseline commit `5f103ef` (M1.5 shell); 45 tests, typecheck and build passed before changes. The Python v1.1.5 archive was previously checked with compilation, JavaScript syntax and isolated route simulations; its full app suite and live venue route were not tested in that environment. The new canonical changes have no authenticated account connection, persistence adapter, exchange order path or transfer path.

Next gates: M2 sourced marks and account reconciliation; durable journal/checkpoint recovery; M4 portfolio limits over actual paper snapshots; M5 fee/slippage fill and order lifecycle; review of unknown marks, timestamp skew and duplicate open orders. M8 LIVE stays locked.
