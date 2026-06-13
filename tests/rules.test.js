import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAutoDeductions,
  cancelBet,
  createBet,
  getOdds,
  getOddsSource,
  refreshOpenBetOdds,
  settleMatch,
  updateBet
} from "../src/core.js";
import { initialState, migrateBettingRules, reconcileUsers, seedUsers } from "../src/state.js";

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
  assert.equal(bet.oddsSource, "manual");
  assert.equal(bet.multiplier, 1);
  assert.equal(state.users.u1.chips, 975);
});

test("reports whether odds came from online sync or a fallback source", () => {
  const { state } = fixture();
  const match = state.sourceCache.matches[0];

  assert.equal(getOddsSource(match, state, config), "manual");
  delete state.overrides.m1;
  assert.equal(getOddsSource(match, state, config), "default");

  state.oddsCache = {
    matches: {
      m1: { odds: { home: 2.25, draw: 3.4, away: 3.1 } }
    }
  };
  assert.equal(getOddsSource(match, state, config), "online");

  state.overrides.m1 = { odds: { home: 2.1, draw: 3.2, away: 3.5 } };
  assert.equal(getOddsSource(match, state, config), "manual");
});

test("rejects creating or updating bets without updated odds", () => {
  const { state, now } = fixture();
  delete state.overrides.m1;
  assert.throws(
    () => createBet(state, config, "u1", { matchId: "m1", pick: "home", stake: 25 }, now),
    /未拉取真实赔率/
  );

  state.oddsCache = { matches: { m1: { odds: { home: 2.2, draw: 3.3, away: 3.8 } } } };
  const bet = createBet(state, config, "u1", { matchId: "m1", pick: "home", stake: 25 }, now);
  delete state.oddsCache.matches.m1;
  assert.throws(
    () => updateBet(state, config, "u1", bet.id, { pick: "away", stake: 25 }, now),
    /未拉取真实赔率/
  );
});

test("refreshes online open bets and cancels fallback bets with one refund", () => {
  const { state, now } = fixture();
  state.oddsCache = {
    matches: {
      m1: { odds: { home: 2.25, draw: 3.4, away: 3.1 } }
    }
  };
  delete state.overrides.m1;
  const onlineBet = createBet(state, config, "u1", { matchId: "m1", pick: "home", stake: 25 }, now);
  const fallbackBet = {
    id: "fallback",
    userId: "u2",
    matchId: "missing",
    pick: "away",
    stake: 50,
    odds: 3.8,
    status: "open"
  };
  state.bets.push(fallbackBet);
  state.users.u2.chips = 950;
  state.oddsCache.matches.m1.odds.home = 2.5;

  const first = refreshOpenBetOdds(state, config, now + 1000);
  assert.deepEqual(first, {
    cancelledCount: 1,
    refreshedCount: 1,
    changedOddsCount: 1,
    refundedAmount: 50,
    missingUserCount: 0
  });
  assert.equal(onlineBet.odds, 2.5);
  assert.equal(onlineBet.oddsSource, "online");
  assert.equal(fallbackBet.status, "cancelled");
  assert.equal(fallbackBet.cancelReason, "未拉取真实赔率，请联系管理员");
  assert.equal(state.users.u2.chips, 1000);

  const second = refreshOpenBetOdds(state, config, now + 2000);
  assert.equal(second.cancelledCount, 0);
  assert.equal(second.refundedAmount, 0);
  assert.equal(state.users.u2.chips, 1000);
});

test("accepts the quick stake amounts", () => {
  for (const stake of [1, 25, 50]) {
    const { state, now } = fixture();
    const bet = createBet(state, config, "u1", { matchId: "m1", pick: "home", stake }, now);
    assert.equal(bet.stake, stake);
    assert.equal(state.users.u1.chips, 1000 - stake);
  }
});

test("uses stage-specific stake limits", () => {
  const stages = [
    { round: "Round of 32", group: null, accepted: 100, rejected: 101, max: 100 },
    { round: "Match for third place", group: null, accepted: 150, rejected: 151, max: 150 },
    { round: "Final", group: null, accepted: 150, rejected: 151, max: 150 }
  ];

  for (const stage of stages) {
    const acceptedFixture = fixture();
    Object.assign(acceptedFixture.state.sourceCache.matches[0], stage);
    const bet = createBet(
      acceptedFixture.state,
      config,
      "u1",
      { matchId: "m1", pick: "home", stake: stage.accepted },
      acceptedFixture.now
    );
    assert.equal(bet.stake, stage.accepted);

    const rejectedFixture = fixture();
    Object.assign(rejectedFixture.state.sourceCache.matches[0], stage);
    assert.throws(
      () => createBet(
        rejectedFixture.state,
        config,
        "u1",
        { matchId: "m1", pick: "home", stake: stage.rejected },
        rejectedFixture.now
      ),
      new RegExp(`投注金额必须为 1-${stage.max} 的整数`)
    );
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
  assert.equal(bet.oddsSource, "manual");
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

test("settles decimal odds to two decimal places", () => {
  const { state, now } = fixture();
  state.overrides.m1 = {
    odds: { home: 2.05, draw: 3.4, away: 4.2 },
    status: "finished",
    score: { ft: [2, 1] }
  };
  const bet = createBet(state, config, "u1", { matchId: "m1", pick: "home", stake: 2 }, now);

  settleMatch(state, state.sourceCache.matches[0], now + 4 * 60 * 60 * 1000);

  assert.equal(bet.payout, 4.1);
  assert.equal(state.users.u1.chips, 1002.1);
});

test("migrates rounded historical payouts and credits the difference", () => {
  const { state } = fixture();
  state.bettingRuleVersion = 2;
  state.users.u1.chips = 3170;
  state.bets.push({
    id: "historical",
    userId: "u1",
    matchId: "m1",
    pick: "home",
    stake: 50,
    odds: 2.05,
    status: "settled",
    payout: 102
  });

  assert.equal(migrateBettingRules(state, { ...config, users: [] }), true);
  assert.equal(state.bets[0].payout, 102.5);
  assert.equal(state.users.u1.chips, 4170.5);
  assert.equal(state.bettingRuleVersion, 4);
  assert.equal(migrateBettingRules(state, { ...config, users: [] }), false);
  assert.equal(state.users.u1.chips, 4170.5);
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
  state.sourceCache.matches[0].date = "2026-06-12";
  state.sourceCache.matches[0].startAt = new Date(now - 60 * 1000).toISOString();
  const first = applyAutoDeductions(state, config, now);
  const second = applyAutoDeductions(state, config, now);
  assert.equal(first.length, 2);
  assert.equal(second.length, 0);
  assert.equal(state.users.u1.chips, 950);
  assert.equal(state.users.u2.chips, 950);
  assert.equal(state.bets.filter((bet) => bet.type === "auto-deduction").length, 2);
  assert.equal(state.bets[0].reason, "比赛开始未下注，自动扣除 50 筹码");
});

test("does not auto deduct users with an active bet", () => {
  const { state, now } = fixture();
  createBet(state, config, "u1", { matchId: "m1", pick: "home", stake: 25 }, now);
  state.sourceCache.matches[0].date = "2026-06-12";
  state.sourceCache.matches[0].startAt = new Date(now - 60 * 1000).toISOString();
  const deductions = applyAutoDeductions(state, config, now);
  assert.equal(deductions.length, 1);
  assert.equal(deductions[0].userId, "u2");
  assert.equal(state.users.u1.chips, 975);
  assert.equal(state.users.u2.chips, 950);
});

test("does not retroactively auto deduct matches before the rule start date", () => {
  const { state, now } = fixture();
  state.sourceCache.matches[0].date = "2026-06-11";
  state.sourceCache.matches[0].startAt = new Date(now - 60 * 1000).toISOString();
  const deductions = applyAutoDeductions(state, config, now);
  assert.equal(deductions.length, 0);
  assert.equal(state.users.u1.chips, 1000);
  assert.equal(state.users.u2.chips, 1000);
});

test("reconciles existing users without resetting current chips", () => {
  const state = {
    users: {
      u1: {
        id: "u1",
        username: "old-name",
        name: "Old",
        role: "player",
        chips: 875
      }
    },
    sessions: {}
  };

  reconcileUsers(state, [
    {
      id: "u1",
      username: "new-name",
      name: "New",
      role: "admin",
      initialChips: 5000
    }
  ]);

  assert.deepEqual(state.users.u1, {
    id: "u1",
    username: "new-name",
    name: "New",
    role: "admin",
    chips: 875
  });
});

test("adds the 1000 chip balance grant only once", () => {
  const state = {
    bettingRuleVersion: 3,
    users: {
      u1: { id: "u1", chips: 875 },
      u2: { id: "u2", chips: 1200 }
    },
    bets: []
  };
  const migrationConfig = { users: [] };

  assert.equal(migrateBettingRules(state, migrationConfig), true);
  assert.equal(state.users.u1.chips, 1875);
  assert.equal(state.users.u2.chips, 2200);
  assert.equal(migrateBettingRules(state, migrationConfig), false);
  assert.equal(state.users.u1.chips, 1875);
  assert.equal(state.users.u2.chips, 2200);
});

test("new states use increased initial chips without applying the grant twice", () => {
  const state = initialState();
  seedUsers(state, {
    users: [{ id: "u1", username: "u1", name: "U1", role: "player", initialChips: 6000 }]
  });

  assert.equal(migrateBettingRules(state, { users: [] }), false);
  assert.equal(state.users.u1.chips, 6000);
});

test("reconciles new and removed users", () => {
  const state = {
    users: {
      old: {
        id: "old",
        username: "old",
        name: "Old",
        role: "player",
        chips: 125
      }
    },
    sessions: {
      keep: { userId: "new" },
      remove: { userId: "old" }
    }
  };

  reconcileUsers(state, [
    {
      id: "new",
      username: "new",
      name: "New",
      role: "player",
      initialChips: 3000
    }
  ]);

  assert.equal(state.users.old, undefined);
  assert.deepEqual(state.users.new, {
    id: "new",
    username: "new",
    name: "New",
    role: "player",
    chips: 3000
  });
  assert.equal(state.sessions.remove, undefined);
  assert.deepEqual(state.sessions.keep, { userId: "new" });
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
