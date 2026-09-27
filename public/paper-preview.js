window.TRADEDART_PAPER_PREVIEW = {
  "mode": "PAPER",
  "source": "DETERMINISTIC_FIXTURE",
  "fixtureAsOf": "2026-01-01T00:05:00.000Z",
  "liveExecutionEnabled": false,
  "scenarios": [
    {
      "id": "capacity",
      "title": "SMALL BALANCE",
      "outcome": "REJECT",
      "equityQuote": 17.32,
      "availableQuote": 3.1400000000000006,
      "maxNotionalQuote": 4.33,
      "drawdownPct": 0,
      "reason": "BELOW_MIN_NOTIONAL",
      "detail": "A $5 order minimum cannot fit beneath the equity cap or available quote funds. The risk limit stays in place.",
      "trace": [
        "EQUITY $17.32",
        "FREE QUOTE $3.14",
        "25% CAP $4.33",
        "Risk veto: BELOW_MIN_NOTIONAL: risk-sized paper order cannot meet the minimum"
      ]
    },
    {
      "id": "daily",
      "title": "DAILY LOSS PAUSE",
      "outcome": "REJECT",
      "equityQuote": 9699,
      "availableQuote": 9699,
      "maxNotionalQuote": 2424.75,
      "drawdownPct": 3.01,
      "reason": "DAILY_DRAWDOWN_LIMIT",
      "detail": "New paper entries pause for the UTC day. The open-position close path remains separate.",
      "trace": [
        "DAY ANCHOR $10000.00",
        "EQUITY $9699.00",
        "DRAWDOWN 3.01%",
        "DAILY_DRAWDOWN_LIMIT: new entries are paused"
      ]
    },
    {
      "id": "total",
      "title": "TOTAL DRAWDOWN KILL",
      "outcome": "REJECT",
      "equityQuote": 10100,
      "availableQuote": 10100,
      "maxNotionalQuote": 2525,
      "drawdownPct": 8.181818181818182,
      "reason": "TOTAL_DRAWDOWN_LIMIT",
      "detail": "New paper entries stay blocked after the next day and after a serialized checkpoint restart.",
      "trace": [
        "LIFETIME PEAK $11000.00",
        "EQUITY $10100.00",
        "DRAWDOWN 8.18%",
        "TOTAL_DRAWDOWN_LIMIT: new entries are killed"
      ]
    },
    {
      "id": "approved",
      "title": "APPROVED PAPER SIGNAL",
      "outcome": "PASS",
      "equityQuote": 10000,
      "availableQuote": 10000,
      "maxNotionalQuote": 2500,
      "drawdownPct": 0,
      "reason": "ALL_CHECKS_PASSED",
      "detail": "A thesis-linked legacy heuristic proposes BTC; the shared risk engine approves this paper fixture.",
      "trace": [
        "STRATEGY STRAT-BTC-0001",
        "INTENT INTENT-0001",
        "SIZE 0.02 BTC",
        "MODE PAPER",
        "RISK PASS"
      ]
    }
  ]
};
