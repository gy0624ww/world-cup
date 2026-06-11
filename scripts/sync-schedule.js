import fs from "node:fs/promises";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const usersPath = path.join(rootDir, "config", "users.json");
const tournamentPath = path.join(rootDir, "config", "tournament.json");

function cookieFromHeaders(headers) {
  const raw = headers.getSetCookie ? headers.getSetCookie() : [headers.get("set-cookie")].filter(Boolean);
  return raw.map((item) => item.split(";")[0]).join("; ");
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function main() {
  const mode = process.argv.includes("--odds") ? "odds" : "schedule";
  const [{ users }, tournament] = await Promise.all([
    readJson(usersPath),
    readJson(tournamentPath)
  ]);
  const admin = users.find((user) => user.role === "admin");
  if (!admin) throw new Error("没有可用于同步的管理员账号");

  const basePath = tournament.basePath || "/world-cup";
  const port = Number(tournament.port || process.env.PORT || 3008);
  const origin = `http://127.0.0.1:${port}${basePath}`;

  const loginResponse = await fetch(`${origin}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: admin.username,
      password: admin.password
    })
  });
  if (!loginResponse.ok) {
    const body = await loginResponse.text();
    throw new Error(`登录失败: HTTP ${loginResponse.status} ${body}`);
  }

  const cookie = cookieFromHeaders(loginResponse.headers);
  const endpoint = mode === "odds" ? "/api/admin/sync-odds" : "/api/admin/sync";
  const syncResponse = await fetch(`${origin}${endpoint}`, {
    method: "POST",
    headers: { cookie }
  });
  const payload = await syncResponse.json().catch(() => ({}));
  if (!syncResponse.ok) {
    throw new Error(`同步失败: HTTP ${syncResponse.status} ${JSON.stringify(payload)}`);
  }

  if (mode === "odds") {
    const odds = payload.oddsSync;
    const oddsText = odds?.skipped
      ? `odds skipped: ${odds.reason}`
      : odds?.ok
        ? `odds updated ${odds.updated || 0}, locked ${odds.locked || 0}, events ${odds.eventCount || 0}`
        : `odds failed: ${odds?.error || "unknown error"}`;
    console.log(`[${new Date().toISOString()}] ${oddsText}`);
    return;
  }

  console.log(`[${new Date().toISOString()}] synced ${payload.sourceCache?.matches?.length || 0} matches`);
}

main().catch((error) => {
  console.error(`[${new Date().toISOString()}] ${error.stack || error.message}`);
  process.exitCode = 1;
});
