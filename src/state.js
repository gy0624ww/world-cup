import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import tls from "node:tls";
import { fileURLToPath } from "node:url";
import {
  normalizeMatches,
  settleFinishedMatches,
  slug
} from "./core.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const configDir = path.join(rootDir, "config");
const dataDir = path.join(rootDir, "data");
const statePath = path.join(dataDir, "state.json");
const kvUrl = process.env.KV_REST_API_URL || "";
const kvToken = process.env.KV_REST_API_TOKEN || "";
const redisUrl = process.env.REDIS_URL || "";
const kvPrefix = process.env.WC_KV_PREFIX || "world-cup";
const memoryStore = new Map();
const hasRestStorage = Boolean(kvUrl && kvToken);
const hasRedisStorage = Boolean(redisUrl);
const useMemoryStorage = Boolean(process.env.VERCEL) && !hasRestStorage && !hasRedisStorage;
const ODDS_PROVIDER_SOURCE = "the-odds-api";
const ODDS_ALIAS = new Map([
  ["usa", "united-states"],
  ["u-s-a", "united-states"],
  ["us", "united-states"],
  ["united-states-of-america", "united-states"],
  ["korea-republic", "south-korea"],
  ["south-korea", "south-korea"],
  ["republic-of-korea", "south-korea"],
  ["cote-divoire", "ivory-coast"],
  ["cote-d-ivoire", "ivory-coast"],
  ["czechia", "czech-republic"],
  ["turkiye", "turkey"],
  ["bosnia-and-herzegovina", "bosnia-herzegovina"],
  ["bosnia-herzegovina", "bosnia-herzegovina"],
  ["congo-dr", "dr-congo"],
  ["d-r-congo", "dr-congo"],
  ["congo-democratic-republic", "dr-congo"]
]);

export async function readJson(filePath, fallback) {
  const key = storageKey(filePath);
  if (key) {
    const stored = await kvCommand(["GET", key]);
    if (stored !== null && stored !== undefined) return JSON.parse(stored);
  }
  const memoryKey = inMemoryKey(filePath);
  if (memoryKey && memoryStore.has(memoryKey)) {
    return structuredClone(memoryStore.get(memoryKey));
  }
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" && arguments.length > 1) return fallback;
    throw error;
  }
}

export async function writeJson(filePath, value) {
  const key = storageKey(filePath);
  if (key) {
    await kvCommand(["SET", key, JSON.stringify(value)]);
    return;
  }
  const memoryKey = inMemoryKey(filePath);
  if (memoryKey) {
    memoryStore.set(memoryKey, structuredClone(value));
    return;
  }
  const tempPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, filePath);
}

function inMemoryKey(filePath) {
  if (!useMemoryStorage) return null;
  const relative = path.relative(rootDir, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  if (!relative.startsWith("data/") && !relative.startsWith("config/")) return null;
  return relative.replaceAll(path.sep, "/");
}

function storageKey(filePath) {
  if (!hasRestStorage && !hasRedisStorage) return null;
  const relative = path.relative(rootDir, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  if (!relative.startsWith("data/") && !relative.startsWith("config/")) return null;
  return `${kvPrefix}:${relative.replaceAll(path.sep, "/")}`;
}

async function kvCommand(command) {
  if (hasRedisStorage && !hasRestStorage) {
    return redisCommand(command);
  }
  const response = await fetch(kvUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${kvToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(command)
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`KV 请求失败: HTTP ${response.status}${body ? ` ${body.slice(0, 160)}` : ""}`);
  }
  const payload = await response.json();
  if (payload.error) throw new Error(`KV 请求失败: ${payload.error}`);
  return payload.result;
}

async function redisCommand(command) {
  const url = new URL(redisUrl);
  const port = Number(url.port || (url.protocol === "rediss:" ? 6380 : 6379));
  const password = decodeURIComponent(url.password || "");
  const username = decodeURIComponent(url.username || "");
  const socket = url.protocol === "rediss:"
    ? tls.connect({ host: url.hostname, port, servername: url.hostname })
    : net.connect({ host: url.hostname, port });

  let buffer = Buffer.alloc(0);
  let settled = false;

  const writeCommand = (parts) => {
    const payload = [
      `*${parts.length}\r\n`,
      ...parts.flatMap((part) => {
        const text = String(part);
        return [`$${Buffer.byteLength(text)}\r\n`, `${text}\r\n`];
      })
    ].join("");
    socket.write(payload);
  };

  const readResponse = () => new Promise((resolve, reject) => {
    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const tryParse = () => {
      try {
        const parsed = parseRedisResponse(buffer);
        if (!parsed) return;
        buffer = buffer.subarray(parsed.offset);
        cleanup();
        resolve(parsed.value);
      } catch (error) {
        cleanup();
        reject(error);
      }
    };
    const onData = (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      tryParse();
    };

    socket.on("data", onData);
    socket.once("error", onError);
    tryParse();
  });

  try {
    await new Promise((resolve, reject) => {
      socket.once(url.protocol === "rediss:" ? "secureConnect" : "connect", resolve);
      socket.once("error", reject);
    });
    if (password) {
      writeCommand(username ? ["AUTH", username, password] : ["AUTH", password]);
      const auth = await readResponse();
      if (auth !== "OK") throw new Error("Redis 认证失败");
    }
    writeCommand(command);
    const result = await readResponse();
    settled = true;
    return result;
  } finally {
    if (!settled) socket.destroy();
    else socket.end();
  }
}

function parseRedisResponse(buffer, offset = 0) {
  if (offset >= buffer.length) return null;
  const prefix = String.fromCharCode(buffer[offset]);
  const lineEnd = buffer.indexOf("\r\n", offset);
  if (lineEnd === -1) return null;
  const line = buffer.subarray(offset + 1, lineEnd).toString("utf8");
  const next = lineEnd + 2;

  if (prefix === "+") return { value: line, offset: next };
  if (prefix === "-") throw new Error(`Redis 请求失败: ${line}`);
  if (prefix === ":") return { value: Number(line), offset: next };
  if (prefix === "$") {
    const length = Number(line);
    if (length === -1) return { value: null, offset: next };
    const end = next + length;
    if (buffer.length < end + 2) return null;
    return { value: buffer.subarray(next, end).toString("utf8"), offset: end + 2 };
  }
  if (prefix === "*") {
    const count = Number(line);
    if (count === -1) return { value: null, offset: next };
    const values = [];
    let cursor = next;
    for (let index = 0; index < count; index += 1) {
      const parsed = parseRedisResponse(buffer, cursor);
      if (!parsed) return null;
      values.push(parsed.value);
      cursor = parsed.offset;
    }
    return { value: values, offset: cursor };
  }
  throw new Error("Redis 返回格式异常");
}

export async function loadConfig() {
  const [tournament, users] = await Promise.all([
    readJson(path.join(configDir, "tournament.json")),
    readJson(path.join(configDir, "users.json"))
  ]);
  return {
    ...tournament,
    users: users.users || []
  };
}

export function initialState() {
  return {
    version: 1,
    sourceCache: {
      name: "World Cup 2026",
      sourceUrl: "",
      lastSyncedAt: null,
      matches: []
    },
    oddsCache: initialOddsCache(),
    users: {},
    sessions: {},
    bets: [],
    overrides: {}
  };
}

function initialOddsCache() {
  return {
    source: ODDS_PROVIDER_SOURCE,
    lastSyncedAt: null,
    lastSkippedReason: null,
    matches: {}
  };
}

export async function loadState(config) {
  await fs.mkdir(dataDir, { recursive: true });
  const state = await readJson(statePath, initialState());
  state.sourceCache ||= initialState().sourceCache;
  state.users ||= {};
  state.sessions ||= {};
  state.bets ||= [];
  state.overrides ||= {};
  state.oddsCache ||= initialOddsCache();
  state.oddsCache.matches ||= {};
  seedUsers(state, config);
  normalizeUserCards(state, config);
  if (!state.sourceCache.matches?.length) {
    try {
      await syncSchedule(state, config);
    } catch (error) {
      await loadSeedSchedule(state, config, error);
    }
  }
  settleFinishedMatches(state, config);
  await saveState(state);
  return state;
}

export function seedUsers(state, config) {
  for (const user of config.users) {
    if (!state.users[user.id]) {
      state.users[user.id] = {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role || "player",
        chips: Number(user.initialChips || 0),
        cards: {
          "2": Number(user.cards?.["2"] || 0),
          "3": Number(user.cards?.["3"] || 0)
        }
      };
    } else {
      state.users[user.id].username = user.username;
      state.users[user.id].name = user.name;
      state.users[user.id].role = user.role || "player";
      state.users[user.id].cards ||= { "2": 0, "3": 0 };
      state.users[user.id].cards["2"] ??= 0;
      state.users[user.id].cards["3"] ??= 0;
    }
  }
}

export function normalizeUserCards(state, config) {
  const configuredCards = new Map(
    config.users.map((user) => [
      user.id,
      {
        "2": Number(user.cards?.["2"] || 0),
        "3": Number(user.cards?.["3"] || 0)
      }
    ])
  );

  for (const user of Object.values(state.users)) {
    const base = configuredCards.get(user.id);
    if (!base) continue;
    const used = { "2": 0, "3": 0 };
    for (const bet of state.bets || []) {
      if (bet.userId !== user.id || bet.status === "cancelled") continue;
      const card = String(bet.multiplier || 1);
      if (card === "2" || card === "3") used[card] += 1;
    }
    user.cards = {
      "2": Math.max(0, base["2"] - used["2"]),
      "3": Math.max(0, base["3"] - used["3"])
    };
  }
}

export function reconcileUsers(state, users) {
  const nextIds = new Set(users.map((user) => user.id));
  for (const userId of Object.keys(state.users)) {
    if (!nextIds.has(userId)) {
      delete state.users[userId];
    }
  }
  for (const [token, session] of Object.entries(state.sessions)) {
    if (!nextIds.has(session.userId)) {
      delete state.sessions[token];
    }
  }
  for (const user of users) {
    state.users[user.id] = {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role || "player",
      chips: Number(user.initialChips || 0),
      cards: {
        "2": Number(user.cards?.["2"] || 0),
        "3": Number(user.cards?.["3"] || 0)
      }
    };
  }
}

export async function saveState(state) {
  await fs.mkdir(dataDir, { recursive: true });
  await writeJson(statePath, state);
}

export async function syncSchedule(state, config) {
  const response = await fetch(config.sourceUrl, {
    headers: {
      "user-agent": "world-cup-betting-hub/1.0"
    }
  });
  if (!response.ok) {
    throw new Error(`赛程同步失败: HTTP ${response.status}`);
  }
  const source = await response.json();
  state.sourceCache = {
    name: source.name || "World Cup 2026",
    sourceUrl: config.sourceUrl,
    lastSyncedAt: new Date().toISOString(),
    matches: normalizeMatches(source, config)
  };
  return state.sourceCache;
}

function canonicalTeam(value) {
  const key = slug(value);
  return ODDS_ALIAS.get(key) || key;
}

function findOutcomePrice(outcomes, teamName) {
  const wanted = canonicalTeam(teamName);
  const outcome = outcomes.find((item) => canonicalTeam(item.name) === wanted);
  return Number(outcome?.price);
}

function findDrawPrice(outcomes) {
  const outcome = outcomes.find((item) => ["draw", "tie"].includes(canonicalTeam(item.name)));
  return Number(outcome?.price);
}

function pickBookmaker(bookmakers, priority = []) {
  const withMarket = (bookmaker) => bookmaker?.markets?.find((market) => market.key === "h2h");
  for (const key of priority) {
    const match = bookmakers.find((bookmaker) => bookmaker.key === key && withMarket(bookmaker));
    if (match) return { bookmaker: match, market: withMarket(match) };
  }
  const bookmaker = bookmakers.find((item) => withMarket(item));
  return bookmaker ? { bookmaker, market: withMarket(bookmaker) } : null;
}

function clearUnlockedCachedOdds(state, match) {
  const cached = state.oddsCache.matches[match.id];
  if (cached && !cached.lockedAt) {
    delete state.oddsCache.matches[match.id];
  }
}

function findLocalMatchForOddsEvent(event, matches) {
  const home = canonicalTeam(event.home_team);
  const away = canonicalTeam(event.away_team);
  const eventStart = new Date(event.commence_time).getTime();
  if (!home || !away || !Number.isFinite(eventStart)) return null;

  const candidates = matches
    .filter((match) => {
      const team1 = canonicalTeam(match.team1);
      const team2 = canonicalTeam(match.team2);
      if (team1 === "tbd" || team2 === "tbd") return false;
      const sameOrder = team1 === home && team2 === away;
      const reversed = team1 === away && team2 === home;
      if (!sameOrder && !reversed) return false;
      const diffHours = Math.abs(new Date(match.startAt).getTime() - eventStart) / (60 * 60 * 1000);
      return diffHours <= 36;
    })
    .sort((a, b) => {
      const aDiff = Math.abs(new Date(a.startAt).getTime() - eventStart);
      const bDiff = Math.abs(new Date(b.startAt).getTime() - eventStart);
      return aDiff - bDiff;
    });

  return candidates[0] || null;
}

export async function syncOdds(state, config, now = Date.now()) {
  const provider = config.oddsProvider || {};
  state.oddsCache ||= initialOddsCache();
  state.oddsCache.matches ||= {};
  state.oddsCache.source = provider.provider || ODDS_PROVIDER_SOURCE;

  if (provider.enabled === false) {
    state.oddsCache.lastSkippedReason = "赔率同步已关闭";
    return { ok: true, skipped: true, reason: state.oddsCache.lastSkippedReason };
  }

  const apiKeyEnv = provider.apiKeyEnv || "THE_ODDS_API_KEY";
  const apiKey = process.env[apiKeyEnv] || provider.apiKey;
  if (!apiKey) {
    state.oddsCache.lastSkippedReason = `缺少 ${apiKeyEnv}`;
    return { ok: true, skipped: true, reason: state.oddsCache.lastSkippedReason };
  }

  const sportKey = provider.sportKey || "soccer_fifa_world_cup";
  const requestUrl = new URL(`https://api.the-odds-api.com/v4/sports/${sportKey}/odds`);
  requestUrl.searchParams.set("apiKey", apiKey);
  requestUrl.searchParams.set("regions", provider.regions || "us,uk,eu");
  requestUrl.searchParams.set("markets", provider.markets || "h2h");
  requestUrl.searchParams.set("oddsFormat", provider.oddsFormat || "decimal");

  const response = await fetch(requestUrl, {
    headers: {
      "user-agent": "world-cup-betting-hub/1.0"
    }
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`赔率同步失败: HTTP ${response.status}${body ? ` ${body.slice(0, 160)}` : ""}`);
  }

  const events = await response.json();
  if (!Array.isArray(events)) {
    throw new Error("赔率同步失败: API 返回格式异常");
  }

  const nowIso = new Date(now).toISOString();
  let updated = 0;
  let locked = 0;
  let unmatched = 0;

  for (const match of state.sourceCache.matches || []) {
    if (now >= new Date(match.startAt).getTime()) {
      const cached = state.oddsCache.matches[match.id];
      if (cached && !cached.lockedAt) {
        cached.lockedAt = nowIso;
        locked += 1;
      }
    }
  }

  for (const event of events) {
    const match = findLocalMatchForOddsEvent(event, state.sourceCache.matches || []);
    if (!match) {
      unmatched += 1;
      continue;
    }
    if (now >= new Date(match.startAt).getTime()) {
      if (state.oddsCache.matches[match.id] && !state.oddsCache.matches[match.id].lockedAt) {
        state.oddsCache.matches[match.id].lockedAt = nowIso;
      }
      locked += 1;
      continue;
    }

    const priority = provider.bookmakerPriority || [];
    const picked = pickBookmaker(event.bookmakers || [], priority);
    if (!picked || (provider.strictBookmaker && priority.length > 0 && !priority.includes(picked.bookmaker.key))) {
      clearUnlockedCachedOdds(state, match);
      continue;
    }
    const outcomes = picked.market.outcomes || [];
    const odds = {
      home: findOutcomePrice(outcomes, match.team1),
      draw: findDrawPrice(outcomes),
      away: findOutcomePrice(outcomes, match.team2)
    };
    if (!Number.isFinite(odds.home) || !Number.isFinite(odds.draw) || !Number.isFinite(odds.away)) {
      clearUnlockedCachedOdds(state, match);
      unmatched += 1;
      continue;
    }

    state.oddsCache.matches[match.id] = {
      odds,
      sourceEventId: event.id,
      eventHomeTeam: event.home_team,
      eventAwayTeam: event.away_team,
      bookmaker: picked.bookmaker.key,
      bookmakerTitle: picked.bookmaker.title,
      providerLastUpdate: picked.market.last_update || picked.bookmaker.last_update || null,
      syncedAt: nowIso,
      lockedAt: null
    };
    updated += 1;
  }

  state.oddsCache.lastSyncedAt = nowIso;
  state.oddsCache.lastSkippedReason = null;
  return {
    ok: true,
    provider: state.oddsCache.source,
    sportKey,
    updated,
    locked,
    unmatchedEvents: unmatched,
    eventCount: events.length
  };
}

export async function loadSeedSchedule(state, config, cause) {
  const seedPath = path.join(configDir, "worldcup-2026.seed.json");
  const source = await readJson(seedPath, null);
  if (!source) {
    throw cause;
  }
  state.sourceCache = {
    name: source.name || "World Cup 2026",
    sourceUrl: config.sourceUrl,
    lastSyncedAt: null,
    matches: normalizeMatches(source, config)
  };
  state.sourceCache.seededFrom = "config/worldcup-2026.seed.json";
  state.sourceCache.seedReason = cause?.message || "network unavailable";
  return state.sourceCache;
}

export function publicUser(stateUser) {
  if (!stateUser) return null;
  return {
    id: stateUser.id,
    username: stateUser.username,
    name: stateUser.name,
    role: stateUser.role,
    chips: stateUser.chips,
    cards: stateUser.cards
  };
}

export function cleanExpiredSessions(state, now = Date.now()) {
  for (const [token, session] of Object.entries(state.sessions)) {
    if (new Date(session.expiresAt).getTime() <= now) {
      delete state.sessions[token];
    }
  }
}

export const paths = {
  rootDir,
  configDir,
  publicDir: path.join(rootDir, "public"),
  statePath,
  usersConfig: path.join(configDir, "users.json"),
  tournamentConfig: path.join(configDir, "tournament.json")
};
