import test from "node:test";
import assert from "node:assert/strict";
import {
  cancelBet,
  createBet,
  getOdds,
  settleMatch,
  updateBet
} from "../src/core.js";

const config = {
  defaultOdds: { home: 2, draw: 3, away: 4 },
  oddsOverrides: {},
  matchDurationMinutes: 120
};

function fixture(now = Date.UTC(2026, 5, 10, 12, 0, 0)) {
  const start = new Date(now + 60 * 60 * 1000).toISOString();
  const end = new Date(now + 3 * 60 * 60 * 1000).toISOString();
  return {
    now,
    state: {
      sourceCache: {
        matches: [
          {
            id: "m1",
            displayNo: 1,
            round: "Group A",
            date: "2026-06-10",
            time: "13:00 UTC+0",
            startAt: start,
            endAt: end,
            team1: "France",
            team2: "Brazil",
            group: "Group A",
            ground: "Test Stadium",
            baseScore: null
          }
        ]
      },
      users: {
        u1: {
          id: "u1",
          chips: 1000,
          cards: { "2": 1, "3": 1 }
        }
      },
      overrides: {
        m1: {
          odds: { home: 2, draw: 3, away: 4 }
        }
      },
      bets: []
    }
  };
}

test("rejects stakes above current chips", () => {
  const { state, now } = fixture();
  assert.throws(
    () => createBet(state, config, "u1", { matchId: "m1", pick: "home", stake: 1001, multiplier: 1 }, now),
    /不能超过当前筹码/
  );
});

test("creates a bet and reserves chips and multiplier card", () => {
  const { state, now } = fixture();
  const bet = createBet(state, config, "u1", { matchId: "m1", pick: "home", stake: 200, multiplier: 2 }, now);
  assert.equal(bet.status, "open");
  assert.equal(bet.odds, 2);
  assert.equal(state.users.u1.chips, 800);
  assert.equal(state.users.u1.cards["2"], 0);
});

test("rejects duplicate bets for the same match", () => {
  const { state, now } = fixture();
  createBet(state, config, "u1", { matchId: "m1", pick: "home", stake: 100, multiplier: 1 }, now);
  assert.throws(
    () => createBet(state, config, "u1", { matchId: "m1", pick: "away", stake: 100, multiplier: 1 }, now),
    /只能下注一次/
  );
});

test("rejects unavailable multiplier cards", () => {
  const { state, now } = fixture();
  state.users.u1.cards["3"] = 0;
  assert.throws(
    () => createBet(state, config, "u1", { matchId: "m1", pick: "home", stake: 100, multiplier: 3 }, now),
    /3x 倍数卡不足/
  );
});

test("updates an open bet before kickoff and restores old card", () => {
  const { state, now } = fixture();
  const bet = createBet(state, config, "u1", { matchId: "m1", pick: "home", stake: 100, multiplier: 2 }, now);
  updateBet(state, config, "u1", bet.id, { pick: "away", stake: 250, multiplier: 3 }, now);
  assert.equal(bet.pick, "away");
  assert.equal(bet.odds, 4);
  assert.equal(state.users.u1.chips, 750);
  assert.equal(state.users.u1.cards["2"], 1);
  assert.equal(state.users.u1.cards["3"], 0);
});

test("cancels an open bet before kickoff and refunds stake and card", () => {
  const { state, now } = fixture();
  const bet = createBet(state, config, "u1", { matchId: "m1", pick: "home", stake: 300, multiplier: 2 }, now);
  cancelBet(state, "u1", bet.id, now);
  assert.equal(bet.status, "cancelled");
  assert.equal(state.users.u1.chips, 1000);
  assert.equal(state.users.u1.cards["2"], 1);
});

test("locks betting after kickoff", () => {
  const { state, now } = fixture();
  state.sourceCache.matches[0].startAt = new Date(now - 60 * 1000).toISOString();
  assert.throws(
    () => createBet(state, config, "u1", { matchId: "m1", pick: "home", stake: 100, multiplier: 1 }, now),
    /已经开始/
  );
});

test("settles wins with odds first and multiplier after odds", () => {
  const { state, now } = fixture();
  const bet = createBet(state, config, "u1", { matchId: "m1", pick: "home", stake: 100, multiplier: 2 }, now);
  state.overrides.m1 = {
    ...state.overrides.m1,
    status: "finished",
    score: { ft: [2, 1] }
  };
  settleMatch(state, state.sourceCache.matches[0], now + 4 * 60 * 60 * 1000);
  assert.equal(bet.status, "settled");
  assert.equal(bet.payout, 400);
  assert.equal(state.users.u1.chips, 1300);
});

test("settles losing bets without returning reserved stake", () => {
  const { state, now } = fixture();
  const bet = createBet(state, config, "u1", { matchId: "m1", pick: "away", stake: 100, multiplier: 1 }, now);
  state.overrides.m1 = {
    ...state.overrides.m1,
    status: "finished",
    score: { ft: [2, 1] }
  };
  settleMatch(state, state.sourceCache.matches[0], now + 4 * 60 * 60 * 1000);
  assert.equal(bet.status, "lost");
  assert.equal(bet.payout, 0);
  assert.equal(state.users.u1.chips, 900);
});

test("uses manual odds before synced odds", () => {
  const { state } = fixture();
  state.oddsCache = {
    matches: {
      m1: {
        odds: { home: 5, draw: 6, away: 7 }
      }
    }
  };
  assert.deepEqual(getOdds(state.sourceCache.matches[0], state, config), { home: 2, draw: 3, away: 4 });
});

test("uses synced odds before generated fallback", () => {
  const { state } = fixture();
  state.overrides = {};
  state.oddsCache = {
    matches: {
      m1: {
        odds: { home: 2.25, draw: 3.4, away: 3.1 }
      }
    }
  };
  assert.deepEqual(getOdds(state.sourceCache.matches[0], state, config), { home: 2.25, draw: 3.4, away: 3.1 });
});
