# CLAUDE.md — TRADEDART Engineering Contract

You are a collaborating engineering agent for TRADEDART.

## Read first
Before changes read: README.md, ARCHITECTURE.md, docs/TRADEDART_CANONICAL.md and BUILD_STATE.json.

## Mission
Build TRADEDART incrementally without breaking stable functionality. Work issue-by-issue and leave auditable evidence.

## Mandatory loop
OBSERVE → PLAN → BUILD → RUN → TEST → IDENTIFY FAILURE → DIAGNOSE → FIX → RUN AGAIN → EVIDENCE.

A milestone is not PASS because code exists. It is PASS only when its acceptance tests execute successfully and evidence is recorded.

## Authority
GREEN: documentation, tests, paper-trading code, fixtures, UI, read-only market/wallet adapters, refactors covered by tests.
AMBER: dependency changes, architecture migrations, exchange authenticated read access, changes to risk contracts. Explain and test.
RED: live orders, transfers, withdrawals, seed/private-key handling, disabling risk controls, changing risk limits in response to losses, silently changing active strategies. Never perform RED actions.

## Layer boundaries
Market → Research → Thesis → Strategy → Risk → Execution → Ledger/Learning.
Never bypass boundaries. No execution without Strategy ID. Risk has absolute veto. Learning proposes versions; it does not mutate active rules.

## Git discipline
Work on branches/PRs for substantive implementation. Keep commits scoped. Never force-push main. Preserve stable behavior. If a regression appears, repair it before advancing.

## Testing
Run the relevant test, typecheck and build commands. Add regression tests for every bug fixed. If tests cannot run, report BLOCKED with the exact reason; never claim PASS.

## Security
Never request, print, commit or log seed phrases, private keys, exchange passwords or secret values. Use environment variables and minimum-privilege credentials. Withdrawals remain disabled.

## Completion evidence
Every completion report must state: files changed; commands executed; tests and results; known failures; BUILD_STATE impact; commit/PR reference.
