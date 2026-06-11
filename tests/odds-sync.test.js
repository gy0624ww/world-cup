import test from "node:test";
import assert from "node:assert/strict";
import { syncOdds } from "../src/state.js";

const config = {
  oddsProvider: {
    enabled: true,
    apiKey: "test-key",
    sportKey: "soccer_fifa_world_cup",
    regions: "us",
    markets: "h2h",
    oddsFormat: "decimal"
  }
};

function stateWithMatch(startAt) {
  return {
    sourceCache: {
      matches: [
        {
          id: "m1",
          team1: "Spain",
          team2: "Cape Verde",
          startAt,
          endAt: new Date(new Date(startAt).getTime() + 120 * 60 * 1000).toISOString()
        }
      ]
    },
    oddsCache: {
      source: "the-odds-api",
      lastSyncedAt: null,
      matches: {}
    }
  };
}

function mockOddsFetch(odds) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => [
      {
        id: "odds-event-1",
        home_team: "Spain",
        away_team: "Cape Verde",
        commence_time: "2026-06-16T00:00:00Z",
        bookmakers: [
          {
            key: "draftkings",
            title: "DraftKings",
            markets: [
              {
                key: "h2h",
                last_update: "2026-06-11T00:00:00Z",
                outcomes: [
                  { name: "Spain", price: odds.home },
                  { name: "Draw", price: odds.draw },
                  { name: "Cape Verde", price: odds.away }
                ]
              }
            ]
          }
        ]
      }
    ]
  });
  return () => {
    globalThis.fetch = original;
  };
}

test("syncOdds stores API odds for matches that have not started", async () => {
  const restore = mockOddsFetch({ home: 1.72, draw: 3.6, away: 4.4 });
  try {
    const state = stateWithMatch("2026-06-16T00:00:00Z");
    const result = await syncOdds(state, config, Date.parse("2026-06-11T00:00:00Z"));
    assert.equal(result.updated, 1);
    assert.deepEqual(state.oddsCache.matches.m1.odds, { home: 1.72, draw: 3.6, away: 4.4 });
    assert.equal(state.oddsCache.matches.m1.lockedAt, null);
  } finally {
    restore();
  }
});

test("syncOdds locks started matches and keeps cached odds unchanged", async () => {
  const restore = mockOddsFetch({ home: 1.5, draw: 3.2, away: 6.1 });
  try {
    const state = stateWithMatch("2026-06-16T00:00:00Z");
    state.oddsCache.matches.m1 = {
      odds: { home: 1.72, draw: 3.6, away: 4.4 },
      syncedAt: "2026-06-11T00:00:00Z",
      lockedAt: null
    };
    const result = await syncOdds(state, config, Date.parse("2026-06-16T00:01:00Z"));
    assert.equal(result.updated, 0);
    assert.deepEqual(state.oddsCache.matches.m1.odds, { home: 1.72, draw: 3.6, away: 4.4 });
    assert.equal(state.oddsCache.matches.m1.lockedAt, "2026-06-16T00:01:00.000Z");
  } finally {
    restore();
  }
});
