import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildGroups,
  buildKnockout,
  cancelBet,
  createBet,
  decoratedMatches,
  MARKET_LABELS,
  settleFinishedMatches,
  settleMatch,
  updateBet
} from "./core.js";
import {
  cleanExpiredSessions,
  loadConfig,
  loadState,
  paths,
  publicUser,
  reconcileUsers,
  saveState,
  syncOdds,
  syncSchedule,
  writeJson
} from "./state.js";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

let config = await loadConfig();
const BASE_PATH = process.env.BASE_PATH || config.basePath || "/world-cup";
const PORT = Number(process.env.PORT || config.port || 3008);
const state = await loadState(config);
let writeQueue = Promise.resolve();

async function refreshRuntime() {
  config = await loadConfig();
  const freshState = await loadState(config);
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, freshState);
}

function sanitizeText(value, field) {
  const text = String(value || "").trim();
  if (!text) throw Object.assign(new Error(`${field}不能为空`), { statusCode: 400 });
  return text;
}

function sanitizeId(value) {
  const id = sanitizeText(value, "用户ID")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
  if (!id) throw Object.assign(new Error("用户ID只能包含英文、数字、下划线或短横线"), { statusCode: 400 });
  return id;
}

function sanitizeConfigPayload(body) {
  const users = Array.isArray(body.users) ? body.users : [];
  if (users.length < 1 || users.length > 20) {
    throw Object.assign(new Error("用户数量需要在 1 到 20 个之间"), { statusCode: 400 });
  }
  const seenIds = new Set();
  const seenNames = new Set();
  const cleanUsers = users.map((user) => {
    const id = sanitizeId(user.id);
    const username = sanitizeText(user.username, "账号");
    if (seenIds.has(id) || seenNames.has(username)) {
      throw Object.assign(new Error("用户ID和账号不能重复"), { statusCode: 400 });
    }
    seenIds.add(id);
    seenNames.add(username);
    const role = user.role === "admin" ? "admin" : "player";
    return {
      id,
      username,
      password: sanitizeText(user.password, "密码"),
      name: sanitizeText(user.name, "显示名"),
      role,
      initialChips: Math.max(0, Math.trunc(Number(user.initialChips || 0))),
      cards: {
        "2": Math.max(0, Math.trunc(Number(user.cards?.["2"] || 0))),
        "3": Math.max(0, Math.trunc(Number(user.cards?.["3"] || 0)))
      }
    };
  });
  if (!cleanUsers.some((user) => user.role === "admin")) {
    throw Object.assign(new Error("至少需要保留一个管理员"), { statusCode: 400 });
  }

  const tournament = body.tournament || {};
  const sourceUrl = sanitizeText(tournament.sourceUrl || config.sourceUrl, "赛程源URL");
  if (!/^https?:\/\//.test(sourceUrl)) {
    throw Object.assign(new Error("赛程源URL必须以 http:// 或 https:// 开头"), { statusCode: 400 });
  }
  const defaultOdds = {
    home: Number(tournament.defaultOdds?.home ?? config.defaultOdds.home),
    draw: Number(tournament.defaultOdds?.draw ?? config.defaultOdds.draw),
    away: Number(tournament.defaultOdds?.away ?? config.defaultOdds.away)
  };
  for (const value of Object.values(defaultOdds)) {
    if (!Number.isFinite(value) || value < 1) {
      throw Object.assign(new Error("默认赔率必须大于等于 1"), { statusCode: 400 });
    }
  }

  return {
    users: cleanUsers,
    tournament: {
      sourceUrl,
      matchDurationMinutes: Math.max(1, Math.trunc(Number(tournament.matchDurationMinutes || config.matchDurationMinutes || 120))),
      defaultOdds
    }
  };
}

function publicConfig() {
  return {
    users: config.users,
    tournament: {
      sourceUrl: config.sourceUrl,
      matchDurationMinutes: config.matchDurationMinutes,
      defaultOdds: config.defaultOdds,
      timezoneLabel: config.timezoneLabel,
      basePath: BASE_PATH,
      port: PORT
    }
  };
}

function queueMutation(fn) {
  const run = writeQueue.catch(() => {}).then(async () => {
    const result = await fn();
    cleanExpiredSessions(state);
    await saveState(state);
    return result;
  });
  writeQueue = run.catch(() => {});
  return run;
}

function sendJson(res, status, payload, headers = {}) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers
  });
  res.end(JSON.stringify(payload));
}

function redirect(res, location) {
  res.writeHead(308, { location });
  res.end();
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function getSession(req) {
  cleanExpiredSessions(state);
  const token = parseCookies(req.headers.cookie).wc_session;
  if (!token) return null;
  const session = state.sessions[token];
  if (!session) return null;
  return {
    token,
    ...session,
    user: state.users[session.userId]
  };
}

function requireUser(req) {
  const session = getSession(req);
  if (!session?.user) {
    throw Object.assign(new Error("请先登录"), { statusCode: 401 });
  }
  return session.user;
}

function requireAdmin(req) {
  const user = requireUser(req);
  if (user.role !== "admin") {
    throw Object.assign(new Error("需要管理员权限"), { statusCode: 403 });
  }
  return user;
}

function requireCron(req) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    throw Object.assign(new Error("缺少 CRON_SECRET，无法执行定时任务"), { statusCode: 500 });
  }
  if (req.headers.authorization !== `Bearer ${expected}`) {
    throw Object.assign(new Error("定时任务密钥无效"), { statusCode: 401 });
  }
}

function makeCookie(token) {
  return [
    `wc_session=${encodeURIComponent(token)}`,
    `Path=${BASE_PATH}`,
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=604800"
  ].join("; ");
}

function clearCookie() {
  return `wc_session=; Path=${BASE_PATH}; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function buildBootstrap(user) {
  const now = Date.now();
  settleFinishedMatches(state, config, now);
  const matches = decoratedMatches(state, config, now);
  const userBets = state.bets
    .filter((bet) => bet.userId === user.id && bet.status !== "cancelled")
    .map((bet) => {
      const match = matches.find((item) => item.id === bet.matchId);
      return {
        ...bet,
        pickLabel: MARKET_LABELS[bet.pick],
        match
      };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return {
    basePath: BASE_PATH,
    sourceCache: {
      name: state.sourceCache.name,
      sourceUrl: state.sourceCache.sourceUrl,
      lastSyncedAt: state.sourceCache.lastSyncedAt
    },
    user: publicUser(user),
    matches,
    groups: buildGroups(matches),
    knockout: buildKnockout(matches),
    bets: userBets,
    leaderboard: Object.values(state.users)
      .map(publicUser)
      .sort((a, b) => b.chips - a.chips)
  };
}

async function handleApi(req, res, pathname) {
  if (req.method === "POST" && pathname === "/api/login") {
    const body = await readBody(req);
    const found = config.users.find(
      (user) => user.username === body.username && user.password === body.password
    );
    if (!found) throw Object.assign(new Error("账号或密码错误"), { statusCode: 401 });
    const token = crypto.randomBytes(32).toString("hex");
    await queueMutation(async () => {
      state.sessions[token] = {
        userId: found.id,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      };
    });
    sendJson(res, 200, { user: publicUser(state.users[found.id]) }, { "set-cookie": makeCookie(token) });
    return;
  }

  if (req.method === "POST" && pathname === "/api/logout") {
    const session = getSession(req);
    if (session) {
      await queueMutation(async () => {
        delete state.sessions[session.token];
      });
    }
    sendJson(res, 200, { ok: true }, { "set-cookie": clearCookie() });
    return;
  }

  if (req.method === "GET" && pathname === "/api/me") {
    const session = getSession(req);
    sendJson(res, session?.user ? 200 : 401, { user: publicUser(session?.user) });
    return;
  }

  if (req.method === "GET" && pathname === "/api/bootstrap") {
    const user = requireUser(req);
    const payload = buildBootstrap(user);
    await saveState(state);
    sendJson(res, 200, payload);
    return;
  }

  if (req.method === "GET" && pathname === "/api/health") {
    sendJson(res, 200, { ok: true, matches: state.sourceCache.matches.length });
    return;
  }

  if (req.method === "GET" && pathname === "/api/cron/sync") {
    requireCron(req);
    const result = await queueMutation(async () => {
      let sourceCache = state.sourceCache;
      let scheduleSync = { ok: true };
      try {
        sourceCache = await syncSchedule(state, config);
      } catch (error) {
        scheduleSync = { ok: false, error: error.message || "赛程同步失败" };
      }
      const settled = settleFinishedMatches(state, config);
      let oddsSync;
      try {
        oddsSync = await syncOdds(state, config);
      } catch (error) {
        oddsSync = { ok: false, error: error.message || "赔率同步失败" };
      }
      return { sourceCache, scheduleSync, settledCount: settled.length, oddsSync };
    });
    sendJson(res, 200, { ok: true, ...result });
    return;
  }

  if (req.method === "POST" && pathname === "/api/bets") {
    const user = requireUser(req);
    const body = await readBody(req);
    const bet = await queueMutation(async () => createBet(state, config, user.id, body));
    sendJson(res, 201, { bet, bootstrap: buildBootstrap(user) });
    return;
  }

  const betMatch = pathname.match(/^\/api\/bets\/([^/]+)$/);
  if (betMatch && req.method === "PATCH") {
    const user = requireUser(req);
    const body = await readBody(req);
    const bet = await queueMutation(async () => updateBet(state, config, user.id, betMatch[1], body));
    sendJson(res, 200, { bet, bootstrap: buildBootstrap(user) });
    return;
  }

  if (betMatch && req.method === "DELETE") {
    const user = requireUser(req);
    const bet = await queueMutation(async () => cancelBet(state, user.id, betMatch[1]));
    sendJson(res, 200, { bet, bootstrap: buildBootstrap(user) });
    return;
  }

  if (req.method === "POST" && pathname === "/api/admin/sync") {
    requireAdmin(req);
    const cache = await queueMutation(async () => {
      const synced = await syncSchedule(state, config);
      settleFinishedMatches(state, config);
      return synced;
    });
    sendJson(res, 200, { ok: true, sourceCache: cache });
    return;
  }

  if (req.method === "POST" && pathname === "/api/admin/sync-odds") {
    requireAdmin(req);
    const oddsSync = await queueMutation(async () => syncOdds(state, config));
    sendJson(res, 200, { ok: true, oddsSync, bootstrap: buildBootstrap(requireUser(req)) });
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/config") {
    requireAdmin(req);
    sendJson(res, 200, publicConfig());
    return;
  }

  if (req.method === "PUT" && pathname === "/api/admin/config") {
    const admin = requireAdmin(req);
    const body = await readBody(req);
    const next = sanitizeConfigPayload(body);
    const updated = await queueMutation(async () => {
      const tournamentConfig = await loadConfig();
      const nextTournamentConfig = {
        ...tournamentConfig,
        sourceUrl: next.tournament.sourceUrl,
        matchDurationMinutes: next.tournament.matchDurationMinutes,
        defaultOdds: next.tournament.defaultOdds
      };
      delete nextTournamentConfig.users;
      await writeJson(paths.usersConfig, { users: next.users });
      await writeJson(paths.tournamentConfig, nextTournamentConfig);
      config = {
        ...nextTournamentConfig,
        users: next.users
      };
      reconcileUsers(state, next.users);
      return publicConfig();
    });
    const responseUser = state.users[admin.id] || Object.values(state.users).find((user) => user.role === "admin");
    sendJson(res, 200, { ok: true, config: updated, bootstrap: buildBootstrap(responseUser) });
    return;
  }

  const adminMatch = pathname.match(/^\/api\/admin\/matches\/([^/]+)$/);
  if (adminMatch && req.method === "PATCH") {
    requireAdmin(req);
    const body = await readBody(req);
    const match = state.sourceCache.matches.find((item) => item.id === adminMatch[1]);
    if (!match) throw Object.assign(new Error("比赛不存在"), { statusCode: 404 });
    const updated = await queueMutation(async () => {
      const current = state.overrides[match.id] || {};
      const next = { ...current, updatedAt: new Date().toISOString() };
      if (body.status) next.status = body.status;
      if (body.winner) next.winner = body.winner;
      if (body.odds) {
        next.odds = {
          home: Number(body.odds.home),
          draw: Number(body.odds.draw),
          away: Number(body.odds.away)
        };
      }
      if (body.score) {
        const home = Number(body.score.home);
        const away = Number(body.score.away);
        if (Number.isFinite(home) && Number.isFinite(away)) {
          next.score = { ft: [home, away] };
        }
      }
      state.overrides[match.id] = next;
      if (next.status === "finished" || next.score) settleMatch(state, match);
      return state.overrides[match.id];
    });
    sendJson(res, 200, { ok: true, override: updated, bootstrap: buildBootstrap(requireUser(req)) });
    return;
  }

  throw Object.assign(new Error("接口不存在"), { statusCode: 404 });
}

async function serveStatic(req, res, pathname) {
  const relative = pathname === "/" ? "index.html" : pathname.slice(1);
  const candidate = path.resolve(paths.publicDir, relative);
  const publicRoot = path.resolve(paths.publicDir);
  if (!candidate.startsWith(publicRoot)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const stats = await fs.stat(candidate);
    const file = stats.isDirectory() ? path.join(candidate, "index.html") : candidate;
    const ext = path.extname(file);
    const body = await fs.readFile(file);
    res.writeHead(200, {
      "content-type": MIME_TYPES[ext] || "application/octet-stream",
      "content-length": body.length,
      "cache-control": ext === ".html" ? "no-store" : "public, max-age=86400"
    });
    res.end(body);
  } catch (error) {
    const body = await fs.readFile(path.join(paths.publicDir, "index.html"));
    res.writeHead(200, {
      "content-type": MIME_TYPES[".html"],
      "content-length": body.length,
      "cache-control": "no-store"
    });
    res.end(body);
  }
}

export async function handleRequest(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const rewrittenPath = url.searchParams.get("path");
    if (rewrittenPath !== null) {
      const pathname = rewrittenPath ? `/${rewrittenPath}` : "/";
      if (pathname.startsWith("/api/")) {
        await refreshRuntime();
        await handleApi(req, res, pathname);
        return;
      }
      await serveStatic(req, res, pathname);
      return;
    }

    if (url.pathname === BASE_PATH) {
      redirect(res, `${BASE_PATH}/`);
      return;
    }
    if (!url.pathname.startsWith(`${BASE_PATH}/`)) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }
    const pathname = url.pathname.slice(BASE_PATH.length) || "/";
    if (pathname.startsWith("/api/")) {
      await refreshRuntime();
      await handleApi(req, res, pathname);
      return;
    }
    await serveStatic(req, res, pathname);
  } catch (error) {
    const status = error.statusCode || 500;
    sendJson(res, status, {
      error: error.message || "服务器错误"
    });
  }
}

const server = http.createServer(handleRequest);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`World Cup betting hub listening on http://127.0.0.1:${PORT}${BASE_PATH}/`);
  });
}
