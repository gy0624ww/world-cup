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
export const BET_MAX_STAKE = 50;
export const AUTO_DEDUCTION_STAKE = 25;
export const AUTO_DEDUCTION_REASON = "比赛开始未下注，自动扣除 25 筹码";
export const AUTO_DEDUCTION_START_DATE = "2026-06-13";

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

export function assertBetInput(input) {
  const stake = Number(input.stake);
  if (!Number.isInteger(stake) || stake < BET_MIN_STAKE || stake > BET_MAX_STAKE) {
    throw Object.assign(new Error("投注金额必须为 1-50 的整数"), { statusCode: 400 });
  }
  if (!["home", "draw", "away"].includes(input.pick)) {
    throw Object.assign(new Error("请选择有效赛果"), { statusCode: 400 });
  }
  return { stake, pick: input.pick, multiplier: 1 };
}

export function createBet(state, config, userId, input, now = Date.now()) {
  const user = state.users[userId];
  if (!user) throw Object.assign(new Error("用户不存在"), { statusCode: 401 });
  const { stake, pick, multiplier } = assertBetInput(input);
  const match = state.sourceCache.matches.find((item) => item.id === input.matchId);
  if (!match) throw Object.assign(new Error("比赛不存在"), { statusCode: 404 });
  if (isMatchLocked(match, now)) {
    throw Object.assign(new Error("比赛已经开始，不能下注或修改"), { statusCode: 409 });
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
  user.chips -= stake;

  const bet = {
    id: crypto.randomUUID(),
    userId,
    matchId: match.id,
    pick,
    stake,
    odds,
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

  const next = assertBetInput({
    matchId: bet.matchId,
    pick: input.pick || bet.pick,
    stake: input.stake ?? bet.stake,
    multiplier: input.multiplier ?? bet.multiplier
  });
  const user = state.users[userId];
  const availableChips = user.chips + bet.stake;

  if (availableChips < next.stake) {
    throw Object.assign(new Error("投注金额不能超过当前筹码"), { statusCode: 400 });
  }

  user.chips = availableChips - next.stake;
  bet.pick = next.pick;
  bet.stake = next.stake;
  bet.multiplier = next.multiplier;
  bet.odds = getOdds(match, state, config)[next.pick];
  bet.updatedAt = new Date(now).toISOString();
  return bet;
}

export function cancelBet(state, userId, betId, now = Date.now()) {
  const bet = state.bets.find((item) => item.id === betId && item.userId === userId);
  if (!bet) throw Object.assign(new Error("注单不存在"), { statusCode: 404 });
  if (bet.status !== "open") throw Object.assign(new Error("注单已结算，不能取消"), { statusCode: 409 });
  const match = state.sourceCache.matches.find((item) => item.id === bet.matchId);
  if (!match) throw Object.assign(new Error("比赛不存在"), { statusCode: 404 });
  if (isMatchLocked(match, now)) throw Object.assign(new Error("比赛已经开始，不能取消"), { statusCode: 409 });

  const user = state.users[userId];
  user.chips += bet.stake;
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
      bet.payout = Math.round(bet.stake * bet.odds);
      bet.status = "settled";
      user.chips += bet.payout;
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
      user.chips = Number(user.chips || 0) - AUTO_DEDUCTION_STAKE;
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
