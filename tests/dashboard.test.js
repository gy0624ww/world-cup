import test from "node:test";
import assert from "node:assert/strict";
import { buildDashboard, buildLeaderboard } from "../src/core.js";

function dashboardFixture() {
  return {
    config: {
      users: [
        { id: "u1", initialChips: 1000 },
        { id: "u2", initialChips: 800 }
      ]
    },
    state: {
      users: {
        u1: { id: "u1", name: "Alpha", chips: 1010 },
        u2: { id: "u2", name: "Beta", chips: 800 }
      },
      sourceCache: {
        matches: [
          {
            id: "m3",
            displayNo: 3,
            startAt: "2026-06-13T18:00:00.000Z",
            team1: "France",
            team2: "Brazil"
          },
          {
            id: "m1",
            displayNo: 1,
            startAt: "2026-06-11T18:00:00.000Z",
            team1: "Spain",
            team2: "Japan"
          },
          {
            id: "m2",
            displayNo: 2,
            startAt: "2026-06-12T18:00:00.000Z",
            team1: "Canada",
            team2: "USA"
          }
        ]
      },
      bets: [
        {
          id: "won",
          userId: "u1",
          matchId: "m1",
          stake: 100,
          payout: 250,
          status: "settled"
        },
        {
          id: "lost",
          userId: "u1",
          matchId: "m2",
          stake: 40,
          payout: 0,
          status: "lost"
        },
        {
          id: "deducted",
          type: "auto-deduction",
          userId: "u1",
          matchId: "m3",
          stake: 50,
          payout: 0,
          status: "deducted"
        },
        {
          id: "open",
          userId: "u1",
          matchId: "m3",
          stake: 50,
          payout: 0,
          status: "open"
        },
        {
          id: "cancelled",
          userId: "u1",
          matchId: "m3",
          stake: 20,
          payout: 0,
          status: "cancelled"
        }
      ]
    }
  };
}

test("buildDashboard aggregates settled betting metrics only", () => {
  const { state, config } = dashboardFixture();
  const dashboard = buildDashboard(state, config);
  const alpha = dashboard.players.find((player) => player.id === "u1");
  const beta = dashboard.players.find((player) => player.id === "u2");

  assert.deepEqual(dashboard.summary, {
    participantCount: 2,
    settledBetCount: 2,
    settledStake: 140,
    totalPayout: 250
  });
  assert.deepEqual(alpha, {
    id: "u1",
    name: "Alpha",
    settledBets: 2,
    wins: 1,
    winRate: 50,
    wagered: 140,
    payout: 250,
    netProfit: 110,
    currentChips: 1010,
    realizedChips: 1060,
    initialChips: 1000
  });
  assert.equal(beta.settledBets, 0);
  assert.equal(beta.wins, 0);
  assert.equal(beta.winRate, 0);
  assert.equal(beta.wagered, 0);
  assert.equal(beta.payout, 0);
  assert.equal(beta.netProfit, 0);
});

test("buildDashboard orders timeline by schedule and applies realized chip changes", () => {
  const { state, config } = dashboardFixture();
  const dashboard = buildDashboard(state, config);
  const alpha = dashboard.timeline.series.find((series) => series.userId === "u1");
  const beta = dashboard.timeline.series.find((series) => series.userId === "u2");

  assert.deepEqual(
    dashboard.timeline.points.map((point) => point.id),
    ["initial", "m1", "m2", "m3"]
  );
  assert.deepEqual(alpha.values, [1000, 1150, 1110, 1060]);
  assert.deepEqual(beta.values, [800, 800, 800, 800]);
});

test("buildDashboard returns a usable empty dashboard", () => {
  const dashboard = buildDashboard(
    { users: {}, sourceCache: { matches: [] }, bets: [] },
    { users: [] }
  );

  assert.deepEqual(dashboard.summary, {
    participantCount: 0,
    settledBetCount: 0,
    settledStake: 0,
    totalPayout: 0
  });
  assert.deepEqual(dashboard.players, []);
  assert.deepEqual(dashboard.timeline.points, [{
    id: "initial",
    matchId: null,
    displayNo: null,
    startAt: null,
    label: "初始筹码"
  }]);
  assert.deepEqual(dashboard.timeline.series, []);
});

test("buildDashboard preserves two-decimal payouts in aggregates and timeline", () => {
  const { state, config } = dashboardFixture();
  state.users.u1.chips = 1010.5;
  state.bets[0].payout = 250.5;

  const dashboard = buildDashboard(state, config);
  const alpha = dashboard.players.find((player) => player.id === "u1");
  const series = dashboard.timeline.series.find((item) => item.userId === "u1");

  assert.equal(dashboard.summary.totalPayout, 250.5);
  assert.equal(alpha.payout, 250.5);
  assert.equal(alpha.netProfit, 110.5);
  assert.deepEqual(series.values, [1000, 1150.5, 1110.5, 1060.5]);
});

test("buildDashboard calculates current chip shares and a 1000 yuan prize split", () => {
  const { state, config } = dashboardFixture();
  const dashboard = buildDashboard(state, config);

  assert.equal(dashboard.chipPool.totalChips, 1860);
  assert.equal(dashboard.chipPool.prizePool, 1000);
  assert.deepEqual(dashboard.chipPool.distribution, [
    {
      userId: "u1",
      name: "Alpha",
      chips: 1060,
      share: 56.99,
      prize: 569.89
    },
    {
      userId: "u2",
      name: "Beta",
      chips: 800,
      share: 43.01,
      prize: 430.11
    }
  ]);
});

test("buildDashboard orders chip distribution by percentage descending", () => {
  const { state, config } = dashboardFixture();
  state.users.u1.chips = 500;
  state.users.u2.chips = 1500;

  const dashboard = buildDashboard(state, config);

  assert.deepEqual(
    dashboard.chipPool.distribution.map(({ userId, share, prize }) => ({ userId, share, prize })),
    [
      { userId: "u2", share: 73.17, prize: 731.71 },
      { userId: "u1", share: 26.83, prize: 268.29 }
    ]
  );
});

test("buildDashboard returns zero chip shares when the current chip pool is empty", () => {
  const { state, config } = dashboardFixture();
  state.users.u1.chips = 0;
  state.users.u2.chips = 0;
  state.bets = [];

  const dashboard = buildDashboard(state, config);

  assert.equal(dashboard.chipPool.totalChips, 0);
  assert.deepEqual(
    dashboard.chipPool.distribution.map(({ share, prize }) => ({ share, prize })),
    [{ share: 0, prize: 0 }, { share: 0, prize: 0 }]
  );
});

test("buildLeaderboard ranks by realized chips without reserving open stakes", () => {
  const state = {
    users: {
      u1: { id: "u1", username: "alpha", name: "Alpha", role: "player", chips: 850 },
      u2: { id: "u2", username: "beta", name: "Beta", role: "player", chips: 920 }
    },
    bets: [
      { userId: "u1", stake: 100, status: "lost" },
      { userId: "u1", stake: 50, status: "open" },
      { userId: "u2", stake: 30, status: "open" },
      { userId: "u2", stake: 20, status: "cancelled" }
    ]
  };

  const leaderboard = buildLeaderboard(state);

  assert.deepEqual(
    leaderboard.map(({ id, chips }) => ({ id, chips })),
    [
      { id: "u2", chips: 950 },
      { id: "u1", chips: 900 }
    ]
  );
});

test("dashboard timeline ends at the same realized chips as the leaderboard", () => {
  const { state, config } = dashboardFixture();
  config.users[0].initialChips = 823;

  const dashboard = buildDashboard(state, config);
  const leaderboard = buildLeaderboard(state);

  for (const series of dashboard.timeline.series) {
    const rankedUser = leaderboard.find((user) => user.id === series.userId);
    assert.equal(series.values.at(-1), rankedUser.chips);
  }
  assert.equal(
    dashboard.timeline.series.find((series) => series.userId === "u1").values[0],
    1000
  );
});
