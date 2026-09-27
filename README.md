# TRADEDART

Wallet-aware crypto research, portfolio and trading intelligence system.

## Operating principle

DISCOVER → RESEARCH → CHALLENGE → PLAN → RISK → EXECUTE → RECORD → REVIEW → LEARN.

TRADEDART is being built paper-first. Live execution remains disabled until explicit human authorization and the required acceptance gates pass.

See `docs/TRADEDART_CANONICAL.md`, `ARCHITECTURE.md`, `CLAUDE.md`, and `BUILD_STATE.json`.

The static dashboard includes a **Paper Lab**. `npm run build` generates `public/paper-preview.js` from the same paper risk code used in tests. The four cases are dated, deterministic fixtures; the dashboard has no connected market or account feed and cannot send an order. Run `python3 -m http.server 8765 --directory public` from the repository root to inspect it locally.
