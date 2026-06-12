import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAutoDeductions,
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
          chips: 1000
        },
        u2: {
          id: "u2",
          chips: 1000
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

test("rejects stakes outside the allowed range", () => {
  const { state, now } = fixture();
  assert.throws(
    () => createBet(state, config, "u1", { matchId: "m1", pick: "home", stake: 0, multiplier: 1 }, now),
    /投注金额必须为 1-50 的整数/
  );
  assert.throws(
    () => createBet(state, config, "u1", { matchId: "m1", pick: "home", stake: 51, multiplier: 1 }, now),
    /投注金额必须为 1-50 的整数/
  );
  assert.throws(
    () => createBet(state, config, "u1", { matchId: "m1", pick: "home", stake: 10.5, multiplier: 1 }, now),
    /投注金额必须为 1-50 的整数/
  );
});

test("creates a bet with a fixed 1x multiplier", () => {
  const { state, now } = fixture();
  const bet = createBet(state, config, "u1", { matchId: "m1", pick: "home", stake: 25, multiplier: 3 }, now);
  assert.equal(bet.status, "open");
  assert.equal(bet.odds, 2);
  assert.equal(bet.multiplier, 1);
  assert.equal(state.users.u1.chips, 975);
});

test("accepts the quick stake amounts", () => {
  for (const stake of [1, 25, 50]) {
    const { state, now } = fixture();
    const bet = createBet(state, config, "u1", { matchId: "m1", pick: "home", stake }, now);
    assert.equal(bet.stake, stake);
    assert.equal(state.users.u1.chips, 1000 - stake);
  }
});

test("rejects duplicate bets for the same match", () => {
  const { state, now } = fixture();
  createBet(state, config, "u1", { matchId: "m1", pick: "home", stake: 25, multiplier: 1 }, now);
  assert.throws(
    () => createBet(state, config, "u1", { matchId: "m1", pick: "away", stake: 25, multiplier: 1 }, now),
    /只能下注一次/
  );
});

test("updates an open bet before kickoff and keeps the fixed multiplier", () => {
  const { state, now } = fixture();
  const bet = createBet(state, config, "u1", { matchId: "m1", pick: "home", stake: 10, multiplier: 2 }, now);
  updateBet(state, config, "u1", bet.id, { pick: "away", stake: 50, multiplier: 3 }, now);
  assert.equal(bet.pick, "away");
  assert.equal(bet.odds, 4);
  assert.equal(bet.multiplier, 1);
  assert.equal(state.users.u1.chips, 950);
});

test("cancels an open bet before kickoff and refunds stake", () => {
  const { state, now } = fixture();
  const bet = createBet(state, config, "u1", { matchId: "m1", pick: "home", stake: 30, multiplier: 2 }, now);
  cancelBet(state, "u1", bet.id, now);
  assert.equal(bet.status, "cancelled");
  assert.equal(state.users.u1.chips, 1000);
});

test("locks betting after kickoff", () => {
  const { state, now } = fixture();
  state.sourceCache.matches[0].startAt = new Date(now - 60 * 1000).toISOString();
  assert.throws(
    () => createBet(state, config, "u1", { matchId: "m1", pick: "home", stake: 25, multiplier: 1 }, now),
    /已经开始/
  );
});

test("locks betting exactly at kickoff", () => {
  const { state, now } = fixture();
  state.sourceCache.matches[0].startAt = new Date(now).toISOString();
  assert.throws(
    () => createBet(state, config, "u1", { matchId: "m1", pick: "home", stake: 25, multiplier: 1 }, now),
    /已经开始/
  );
});

test("settles wins without multiplier bonuses", () => {
  const { state, now } = fixture();
  const bet = createBet(state, config, "u1", { matchId: "m1", pick: "home", stake: 50, multiplier: 3 }, now);
  state.overrides.m1 = {
    ...state.overrides.m1,
    status: "finished",
    score: { ft: [2, 1] }
  };
  settleMatch(state, state.sourceCache.matches[0], now + 4 * 60 * 60 * 1000);
  assert.equal(bet.status, "settled");
  assert.equal(bet.payout, 100);
  assert.equal(state.users.u1.chips, 1050);
});

test("settles wins using the ticket odds locked at bet time", () => {
  const { state, now } = fixture();
  const bet = createBet(state, config, "u1", { matchId: "m1", pick: "home", stake: 50 }, now);
  assert.equal(bet.odds, 2);
  state.overrides.m1 = {
    ...state.overrides.m1,
    odds: { home: 3, draw: 3, away: 4 },
    status: "finished",
    score: { ft: [2, 1] }
  };
  settleMatch(state, state.sourceCache.matches[0], now + 4 * 60 * 60 * 1000);
  assert.equal(bet.odds, 2);
  assert.equal(bet.payout, 100);
  assert.equal(state.users.u1.chips, 1050);
});

test("settles losing bets without returning reserved stake", () => {
  const { state, now } = fixture();
  const bet = createBet(state, config, "u1", { matchId: "m1", pick: "away", stake: 25, multiplier: 1 }, now);
  state.overrides.m1 = {
    ...state.overrides.m1,
    status: "finished",
    score: { ft: [2, 1] }
  };
  settleMatch(state, state.sourceCache.matches[0], now + 4 * 60 * 60 * 1000);
  assert.equal(bet.status, "lost");
  assert.equal(bet.payout, 0);
  assert.equal(state.users.u1.chips, 975);
});

test("auto deducts users who have not bet after kickoff once", () => {
  const { state, now } = fixture();
  state.sourceCache.matches[0].date = "2026-06-13";
  state.sourceCache.matches[0].startAt = new Date(now - 60 * 1000).toISOString();
  const first = applyAutoDeductions(state, config, now);
  const second = applyAutoDeductions(state, config, now);
  assert.equal(first.length, 2);
  assert.equal(second.length, 0);
  assert.equal(state.users.u1.chips, 975);
  assert.equal(state.users.u2.chips, 975);
  assert.equal(state.bets.filter((bet) => bet.type === "auto-deduction").length, 2);
  assert.equal(state.bets[0].reason, "比赛开始未下注，自动扣除 25 筹码");
});

test("does not auto deduct users with an active bet", () => {
  const { state, now } = fixture();
  createBet(state, config, "u1", { matchId: "m1", pick: "home", stake: 25 }, now);
  state.sourceCache.matches[0].date = "2026-06-13";
  state.sourceCache.matches[0].startAt = new Date(now - 60 * 1000).toISOString();
  const deductions = applyAutoDeductions(state, config, now);
  assert.equal(deductions.length, 1);
  assert.equal(deductions[0].userId, "u2");
  assert.equal(state.users.u1.chips, 975);
  assert.equal(state.users.u2.chips, 975);
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
