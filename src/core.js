import crypto from "node:crypto";

export const MARKET_LABELS = {
  home: "主胜",
  draw: "平局",
  away: "客胜"
};

export const ROUND_ORDER = [
  "Round of 32",
  "Round of 16",
  "Quarter-final",
  "Semi-final",
  "Match for third place",
  "Final"
];

export const BET_MIN_STAKE = 1;
export const GROUP_STAGE_MAX_STAKE = 50;
export const KNOCKOUT_MAX_STAKE = 100;
export const FINAL_STAGE_MAX_STAKE = 150;
export const AUTO_DEDUCTION_STAKE = 50;
export const AUTO_DEDUCTION_REASON = "比赛开始未下注，自动扣除 50 筹码";
export const AUTO_DEDUCTION_START_DATE = "2026-06-12";
export const ODDS_UNAVAILABLE_MESSAGE = "未拉取真实赔率，请联系管理员";

export function nowIso() {
  return new Date().toISOString();
}

export function slug(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function parseMatchStart(date, time) {
  const value = String(time || "00:00").trim();
  const match = value.match(/^(\d{1,2}):(\d{2})(?:\s+UTC([+-]\d{1,2}))?$/i);
  if (!match) {
    return new Date(`${date}T00:00:00.000Z`).toISOString();
  }

  const [, hourRaw, minuteRaw, offsetRaw] = match;
  const [year, month, day] = String(date).split("-").map(Number);
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  const offset = offsetRaw === undefined ? 0 : Number(offsetRaw);
  const utcMillis = Date.UTC(year, month - 1, day, hour - offset, minute, 0, 0);
  return new Date(utcMillis).toISOString();
}

export function addMinutes(iso, minutes) {
  return new Date(new Date(iso).getTime() + minutes * 60 * 1000).toISOString();
}

export function makeMatchId(raw, index) {
  if (raw.num) return `m${raw.num}`;
  return [
    slug(raw.group || raw.round || "match"),
    slug(raw.date),
    slug(raw.team1),
    slug(raw.team2),
    index + 1
  ].join("-");
}

export function generatedOdds(id, defaults) {
  const hash = crypto.createHash("sha1").update(id).digest();
  const homeShift = (hash[0] % 9) / 20;
  const drawShift = (hash[1] % 7) / 20;
  const awayShift = (hash[2] % 11) / 20;
  return {
    home: roundOdds(Math.max(1.35, defaults.home + homeShift - 0.2)),
    draw: roundOdds(Math.max(2.7, defaults.draw + drawShift - 0.1)),
    away: roundOdds(Math.max(1.65, defaults.away + awayShift - 0.2))
  };
}

export function roundOdds(value) {
  return Math.round(Number(value) * 100) / 100;
}

export function roundAmount(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function normalizeMatches(source, config) {
  const matches = Array.isArray(source?.matches) ? source.matches : [];
  return matches.map((raw, index) => {
    const startAt = parseMatchStart(raw.date, raw.time);
    const id = makeMatchId(raw, index);
    return {
      id,
      displayNo: raw.num || index + 1,
      round: raw.round || "Matchday",
      date: raw.date,
      time: raw.time || "00:00 UTC+0",
      startAt,
      endAt: addMinutes(startAt, config.matchDurationMinutes || 120),
      team1: raw.team1 || "TBD",
      team2: raw.team2 || "TBD",
      group: raw.group || null,
      ground: raw.ground || "",
      baseScore: raw.score || null,
      sourceIndex: index
    };
  });
}

export function getOdds(match, state, config) {
  const override = state.overrides?.[match.id]?.odds;
  const synced = state.oddsCache?.matches?.[match.id]?.odds;
  const configured = config.oddsOverrides?.[match.id];
  return normalizeOdds(override || synced || configured || generatedOdds(match.id, config.defaultOdds));
}

export function getOddsSource(match, state, config) {
  if (state.overrides?.[match.id]?.odds) return "manual";
  if (state.oddsCache?.matches?.[match.id]?.odds) return "online";
  if (config.oddsOverrides?.[match.id]) return "configured";
  return "default";
}

export function hasUpdatedOdds(match, state, config) {
  return ["manual", "online"].includes(getOddsSource(match, state, config));
}

export function normalizeOdds(odds) {
  return {
    home: roundOdds(odds?.home ?? 1.95),
    draw: roundOdds(odds?.draw ?? 3.25),
    away: roundOdds(odds?.away ?? 3.8)
  };
}

export function getScore(match, state) {
  return state.overrides?.[match.id]?.score || match.baseScore || null;
}

export function getOutcome(match, state) {
  const overrideWinner = state.overrides?.[match.id]?.winner;
  if (["home", "draw", "away"].includes(overrideWinner)) {
    return overrideWinner;
  }

  const score = getScore(match, state);
  if (!score) return null;
  const finalScore = score.p || score.et || score.ft;
  if (!Array.isArray(finalScore) || finalScore.length < 2) return null;
  if (finalScore[0] > finalScore[1]) return "home";
  if (finalScore[0] < finalScore[1]) return "away";
  return "draw";
}

export function formatScore(score) {
  if (!score) return "未赛";
  const latest = score.p || score.et || score.ft;
  if (!latest) return "未赛";
  const suffix = score.p ? " 点" : score.et ? " 加" : "";
  return `${latest[0]} - ${latest[1]}${suffix}`;
}

export function getMatchStatus(match, state, now = Date.now()) {
  const override = state.overrides?.[match.id];
  if (override?.status === "cancelled") return "cancelled";
  if (override?.status === "finished" || getScore(match, state)) return "finished";
  const start = new Date(match.startAt).getTime();
  const end = new Date(match.endAt).getTime();
  if (now >= start && now < end) return "live";
  if (now >= end) return "awaiting";
  return "scheduled";
}

export function decorateMatch(match, state, config, now = Date.now()) {
  const score = getScore(match, state);
  const outcome = getOutcome(match, state);
  return {
    ...match,
    odds: getOdds(match, state, config),
    oddsSource: getOddsSource(match, state, config),
    score,
    scoreText: formatScore(score),
    outcome,
    status: getMatchStatus(match, state, now),
    locked: now >= new Date(match.startAt).getTime()
  };
}

export function decoratedMatches(state, config, now = Date.now()) {
  return [...(state.sourceCache?.matches || [])]
    .sort((a, b) => new Date(a.startAt) - new Date(b.startAt))
    .map((match) => decorateMatch(match, state, config, now));
}

export function isMatchLocked(match, now = Date.now()) {
  return now >= new Date(match.startAt).getTime();
}

export function getBetMaxStake(match) {
  if (["Final", "Match for third place"].includes(match?.round)) {
    return FINAL_STAGE_MAX_STAKE;
  }
  if (!match?.group) {
    return KNOCKOUT_MAX_STAKE;
  }
  return GROUP_STAGE_MAX_STAKE;
}

export function assertBetInput(input, maxStake = GROUP_STAGE_MAX_STAKE) {
  const stake = Number(input.stake);
  if (!Number.isInteger(stake) || stake < BET_MIN_STAKE || stake > maxStake) {
    throw Object.assign(new Error(`投注金额必须为 1-${maxStake} 的整数`), { statusCode: 400 });
  }
  if (!["home", "draw", "away"].includes(input.pick)) {
    throw Object.assign(new Error("请选择有效赛果"), { statusCode: 400 });
  }
  return { stake, pick: input.pick, multiplier: 1 };
}

export function createBet(state, config, userId, input, now = Date.now()) {
  const user = state.users[userId];
  if (!user) throw Object.assign(new Error("用户不存在"), { statusCode: 401 });
  const match = state.sourceCache.matches.find((item) => item.id === input.matchId);
  if (!match) throw Object.assign(new Error("比赛不存在"), { statusCode: 404 });
  const { stake, pick, multiplier } = assertBetInput(input, getBetMaxStake(match));
  if (isMatchLocked(match, now)) {
    throw Object.assign(new Error("比赛已经开始，不能下注或修改"), { statusCode: 409 });
  }
  if (!hasUpdatedOdds(match, state, config)) {
    throw Object.assign(new Error(ODDS_UNAVAILABLE_MESSAGE), { statusCode: 409 });
  }
  const existingBet = state.bets.find(
    (bet) => bet.userId === userId && bet.matchId === match.id && bet.status !== "cancelled"
  );
  if (existingBet) {
    throw Object.assign(new Error("每个场次只能下注一次"), { statusCode: 409 });
  }
  if (user.chips < stake) {
    throw Object.assign(new Error("投注金额不能超过当前筹码"), { statusCode: 400 });
  }

  const odds = getOdds(match, state, config)[pick];
  user.chips = roundAmount(user.chips - stake);

  const bet = {
    id: crypto.randomUUID(),
    userId,
    matchId: match.id,
    pick,
    stake,
    odds,
    oddsSource: getOddsSource(match, state, config),
    multiplier,
    status: "open",
    payout: 0,
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString()
  };
  state.bets.push(bet);
  return bet;
}

export function updateBet(state, config, userId, betId, input, now = Date.now()) {
  const bet = state.bets.find((item) => item.id === betId && item.userId === userId);
  if (!bet) throw Object.assign(new Error("注单不存在"), { statusCode: 404 });
  if (bet.status !== "open") throw Object.assign(new Error("注单已结算，不能修改"), { statusCode: 409 });
  const match = state.sourceCache.matches.find((item) => item.id === bet.matchId);
  if (!match) throw Object.assign(new Error("比赛不存在"), { statusCode: 404 });
  if (isMatchLocked(match, now)) throw Object.assign(new Error("比赛已经开始，不能修改"), { statusCode: 409 });
  if (!hasUpdatedOdds(match, state, config)) {
    throw Object.assign(new Error(ODDS_UNAVAILABLE_MESSAGE), { statusCode: 409 });
  }

  const next = assertBetInput({
    matchId: bet.matchId,
    pick: input.pick || bet.pick,
    stake: input.stake ?? bet.stake,
    multiplier: input.multiplier ?? bet.multiplier
  }, getBetMaxStake(match));
  const user = state.users[userId];
  const availableChips = roundAmount(user.chips + bet.stake);

  if (availableChips < next.stake) {
    throw Object.assign(new Error("投注金额不能超过当前筹码"), { statusCode: 400 });
  }

  user.chips = roundAmount(availableChips - next.stake);
  bet.pick = next.pick;
  bet.stake = next.stake;
  bet.multiplier = next.multiplier;
  bet.odds = getOdds(match, state, config)[next.pick];
  bet.oddsSource = getOddsSource(match, state, config);
  bet.updatedAt = new Date(now).toISOString();
  return bet;
}

export function refreshOpenBetOdds(state, config, now = Date.now()) {
  const updatedAt = new Date(now).toISOString();
  const matches = new Map((state.sourceCache?.matches || []).map((match) => [match.id, match]));
  const summary = {
    cancelledCount: 0,
    refreshedCount: 0,
    changedOddsCount: 0,
    refundedAmount: 0,
    missingUserCount: 0
  };

  for (const bet of state.bets || []) {
    if (bet.type === "auto-deduction" || bet.status !== "open") continue;
    const match = matches.get(bet.matchId);
    const oddsSource = match ? getOddsSource(match, state, config) : "missing";

    if (!match || !hasUpdatedOdds(match, state, config)) {
      const user = state.users[bet.userId];
      if (user) {
        user.chips = roundAmount(Number(user.chips || 0) + Number(bet.stake || 0));
        summary.refundedAmount = roundAmount(summary.refundedAmount + Number(bet.stake || 0));
      } else {
        summary.missingUserCount += 1;
      }
      bet.status = "cancelled";
      bet.oddsSource = oddsSource;
      bet.cancelReason = ODDS_UNAVAILABLE_MESSAGE;
      bet.refundedAt = user ? updatedAt : null;
      bet.updatedAt = updatedAt;
      summary.cancelledCount += 1;
      continue;
    }

    const nextOdds = getOdds(match, state, config)[bet.pick];
    if (Number(bet.odds) !== Number(nextOdds)) {
      bet.odds = nextOdds;
      summary.changedOddsCount += 1;
    }
    bet.oddsSource = oddsSource;
    bet.updatedAt = updatedAt;
    summary.refreshedCount += 1;
  }

  return summary;
}

export function cancelBet(state, userId, betId, now = Date.now()) {
  const bet = state.bets.find((item) => item.id === betId && item.userId === userId);
  if (!bet) throw Object.assign(new Error("注单不存在"), { statusCode: 404 });
  if (bet.status !== "open") throw Object.assign(new Error("注单已结算，不能取消"), { statusCode: 409 });
  const match = state.sourceCache.matches.find((item) => item.id === bet.matchId);
  if (!match) throw Object.assign(new Error("比赛不存在"), { statusCode: 404 });
  if (isMatchLocked(match, now)) throw Object.assign(new Error("比赛已经开始，不能取消"), { statusCode: 409 });

  const user = state.users[userId];
  user.chips = roundAmount(user.chips + bet.stake);
  bet.status = "cancelled";
  bet.updatedAt = new Date(now).toISOString();
  return bet;
}

export function settleMatch(state, match, now = Date.now()) {
  const outcome = getOutcome(match, state);
  if (!outcome) return [];
  const settled = [];
  for (const bet of state.bets) {
    if (bet.matchId !== match.id || bet.status !== "open") continue;
    const user = state.users[bet.userId];
    if (!user) continue;
    if (bet.pick === outcome) {
      bet.payout = roundAmount(bet.stake * bet.odds);
      bet.status = "settled";
      user.chips = roundAmount(user.chips + bet.payout);
    } else {
      bet.payout = 0;
      bet.status = "lost";
    }
    bet.settledAt = new Date(now).toISOString();
    bet.updatedAt = new Date(now).toISOString();
    settled.push(bet);
  }
  return settled;
}

export function settleFinishedMatches(state, config, now = Date.now()) {
  const matches = decoratedMatches(state, config, now);
  const settled = [];
  for (const match of matches) {
    if (match.status === "finished") {
      settled.push(...settleMatch(state, match, now));
    }
  }
  return settled;
}

export function normalizeOpenBetMultipliers(state) {
  for (const bet of state.bets || []) {
    if (bet.status === "open" && bet.type !== "auto-deduction") {
      bet.multiplier = 1;
    }
  }
}

export function applyAutoDeductions(state, config, now = Date.now()) {
  normalizeOpenBetMultipliers(state);
  const matches = decoratedMatches(state, config, now);
  const deductions = [];
  for (const match of matches) {
    if (!match.locked || match.status === "cancelled") continue;
    if (String(match.date || "") < AUTO_DEDUCTION_START_DATE) continue;
    for (const user of Object.values(state.users || {})) {
      const hasRecord = (state.bets || []).some((bet) => (
        bet.userId === user.id
        && bet.matchId === match.id
        && bet.status !== "cancelled"
      ));
      if (hasRecord) continue;
      user.chips = roundAmount(Number(user.chips || 0) - AUTO_DEDUCTION_STAKE);
      const deduction = {
        id: crypto.randomUUID(),
        type: "auto-deduction",
        userId: user.id,
        matchId: match.id,
        pick: null,
        stake: AUTO_DEDUCTION_STAKE,
        odds: 0,
        multiplier: 1,
        status: "deducted",
        payout: 0,
        reason: AUTO_DEDUCTION_REASON,
        createdAt: new Date(now).toISOString(),
        updatedAt: new Date(now).toISOString()
      };
      state.bets.push(deduction);
      deductions.push(deduction);
    }
  }
  return deductions;
}

function openStakeByUser(state) {
  const openStakeByUser = new Map();
  for (const bet of state.bets || []) {
    if (bet.type === "auto-deduction" || bet.status !== "open") continue;
    openStakeByUser.set(
      bet.userId,
      roundAmount(Number(openStakeByUser.get(bet.userId) || 0) + Number(bet.stake || 0))
    );
  }
  return openStakeByUser;
}

export function buildLeaderboard(state) {
  const openStakes = openStakeByUser(state);
  return Object.values(state.users || {})
    .map((user) => ({
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      chips: roundAmount(Number(user.chips || 0) + Number(openStakes.get(user.id) || 0))
    }))
    .sort((a, b) => (
      b.chips - a.chips
      || String(a.name || "").localeCompare(String(b.name || ""), "zh-CN")
    ));
}

export function buildDashboard(state, config) {
  const users = Object.values(state.users || {});
  const openStakes = openStakeByUser(state);
  const matches = new Map((state.sourceCache?.matches || []).map((match) => [match.id, match]));
  const settledBets = (state.bets || []).filter((bet) => (
    bet.type !== "auto-deduction"
    && (bet.status === "settled" || bet.status === "lost")
  ));

  const players = users.map((user) => {
    const userBets = settledBets.filter((bet) => bet.userId === user.id);
    const wonBets = userBets.filter((bet) => bet.status === "settled");
    const wagered = roundAmount(userBets.reduce((sum, bet) => sum + Number(bet.stake || 0), 0));
    const payout = roundAmount(wonBets.reduce((sum, bet) => sum + Number(bet.payout || 0), 0));
    return {
      id: user.id,
      name: user.name,
      settledBets: userBets.length,
      wins: wonBets.length,
      winRate: userBets.length ? Math.round((wonBets.length / userBets.length) * 1000) / 10 : 0,
      wagered,
      payout,
      netProfit: roundAmount(payout - wagered),
      currentChips: roundAmount(user.chips || 0),
      realizedChips: roundAmount(Number(user.chips || 0) + Number(openStakes.get(user.id) || 0)),
      initialChips: 0
    };
  });

  const eventsByMatch = new Map();
  const timelineBets = (state.bets || []).filter((bet) => (
    (bet.type === "auto-deduction" && bet.status === "deducted")
    || (bet.type !== "auto-deduction" && (bet.status === "settled" || bet.status === "lost"))
  ));

  for (const bet of timelineBets) {
    const match = matches.get(bet.matchId);
    if (!match) continue;
    if (!eventsByMatch.has(match.id)) {
      eventsByMatch.set(match.id, {
        matchId: match.id,
        displayNo: match.displayNo,
        startAt: match.startAt,
        label: `${match.team1} vs ${match.team2}`,
        changes: new Map()
      });
    }
    const event = eventsByMatch.get(match.id);
    const delta = roundAmount(bet.type === "auto-deduction" || bet.status === "lost"
      ? -Number(bet.stake || 0)
      : Number(bet.payout || 0) - Number(bet.stake || 0));
    event.changes.set(
      bet.userId,
      roundAmount(Number(event.changes.get(bet.userId) || 0) + delta)
    );
  }

  const events = [...eventsByMatch.values()].sort((a, b) => (
    new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
    || Number(a.displayNo || 0) - Number(b.displayNo || 0)
  ));
  const points = [
    {
      id: "initial",
      matchId: null,
      displayNo: null,
      startAt: null,
      label: "初始筹码"
    },
    ...events.map(({ changes, ...event }) => ({ id: event.matchId, ...event }))
  ];
  const series = players.map((player) => {
    const realizedChange = roundAmount(events.reduce(
      (sum, event) => sum + Number(event.changes.get(player.id) || 0),
      0
    ));
    player.initialChips = roundAmount(player.realizedChips - realizedChange);
    let chips = player.initialChips;
    const values = [chips];
    for (const event of events) {
      chips = roundAmount(chips + Number(event.changes.get(player.id) || 0));
      values.push(chips);
    }
    return {
      userId: player.id,
      name: player.name,
      values
    };
  });
  const totalCurrentChips = roundAmount(players.reduce(
    (sum, player) => sum + Number(player.realizedChips || 0),
    0
  ));
  const chipDistribution = players
    .map((player) => {
      const share = totalCurrentChips > 0
        ? (Number(player.realizedChips || 0) / totalCurrentChips) * 100
        : 0;
      return {
        userId: player.id,
        name: player.name,
        chips: player.realizedChips,
        share: roundAmount(share),
        prize: roundAmount((share / 100) * 1000)
      };
    })
    .sort((a, b) => (
      b.share - a.share
      || String(a.name || "").localeCompare(String(b.name || ""), "zh-CN")
    ));

  return {
    summary: {
      participantCount: players.length,
      settledBetCount: players.reduce((sum, player) => sum + player.settledBets, 0),
      settledStake: roundAmount(players.reduce((sum, player) => sum + player.wagered, 0)),
      totalPayout: roundAmount(players.reduce((sum, player) => sum + player.payout, 0))
    },
    chipPool: {
      totalChips: totalCurrentChips,
      prizePool: 1000,
      distribution: chipDistribution
    },
    players,
    timeline: {
      points,
      series
    }
  };
}

export function buildGroups(matches) {
  const groups = new Map();
  for (const match of matches) {
    if (!match.group) continue;
    if (!groups.has(match.group)) {
      groups.set(match.group, { name: match.group, teams: new Map(), matches: [] });
    }
    const group = groups.get(match.group);
    group.matches.push(match);
    for (const side of ["team1", "team2"]) {
      if (!group.teams.has(match[side])) {
        group.teams.set(match[side], {
          name: match[side],
          played: 0,
          won: 0,
          drawn: 0,
          lost: 0,
          points: 0
        });
      }
    }
  }

  for (const group of groups.values()) {
    for (const match of group.matches) {
      if (match.status !== "finished" || !match.outcome) continue;
      const home = group.teams.get(match.team1);
      const away = group.teams.get(match.team2);
      home.played += 1;
      away.played += 1;
      if (match.outcome === "home") {
        home.won += 1;
        away.lost += 1;
        home.points += 3;
      } else if (match.outcome === "away") {
        away.won += 1;
        home.lost += 1;
        away.points += 3;
      } else {
        home.drawn += 1;
        away.drawn += 1;
        home.points += 1;
        away.points += 1;
      }
    }
  }

  return [...groups.values()].map((group) => ({
    name: group.name,
    teams: [...group.teams.values()].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name)),
    matches: group.matches.sort((a, b) => new Date(a.startAt) - new Date(b.startAt))
  }));
}

export function buildKnockout(matches) {
  const rounds = new Map();
  for (const match of matches) {
    if (match.group) continue;
    if (!rounds.has(match.round)) rounds.set(match.round, []);
    rounds.get(match.round).push(match);
  }
  return ROUND_ORDER.filter((round) => rounds.has(round)).map((round) => ({
    round,
    matches: rounds.get(round).sort((a, b) => Number(a.displayNo) - Number(b.displayNo))
  }));
}
