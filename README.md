# World Cup Betting Hub

多人世界杯竞猜站点，部署路径为 `/world-cup/`。前端使用 daisyUI CDN，后端使用 Node 22 原生 HTTP 服务，无第三方 npm 依赖。

## 本地运行

```bash
npm test
npm start
```

默认服务监听 `127.0.0.1:3008`，入口为 `http://127.0.0.1:3008/world-cup/`。

## 示例账号

- `admin` / `admin2026`，管理员
- `ops` / `ops2026`，管理员
- `player1` / `player12026`
- `player2` / `player22026`
- `player3` / `player32026`

账号、固定密码、初始筹码和倍数卡数量可以由管理员在“系统配置”里维护，也可以直接编辑 `config/users.json`。

## 赛事配置

- `config/tournament.json`：公开赛程源、默认赔率、比赛时长、部署路径。
- `data/state.json`：运行时持久化文件，保存同步赛程、用户筹码、投注、赔率覆盖和赛果覆盖。

管理员登录后可以在“结果管理”里同步 openfootball 赛程，也可以手动保存比分、赛果和赔率。手动覆盖优先于同步数据。

管理员登录后还可以在“系统配置”里维护：

- 登录账号、密码、角色、显示名
- 当前筹码、2x 卡、3x 卡数量
- 赛程源 URL、默认赔率、比赛锁定时长

## 部署

仓库提供两个部署模板：

- `deploy/world-cup.service`
- `deploy/nginx-world-cup.conf`

部署后 Nginx 保留根路径原站点，并把 `/world-cup/` 反代到本地 Node 服务。

### Vercel 部署

项目也支持部署到 Vercel，入口仍然是 `/world-cup/`。

Vercel 环境变量：

- `KV_REST_API_URL`：Vercel KV / Upstash Redis REST URL，用于持久保存投注、登录会话、管理员配置和同步缓存。
- `KV_REST_API_TOKEN`：Vercel KV / Upstash Redis REST Token。
- `CRON_SECRET`：定时任务密钥。Vercel Cron 会用 `Authorization: Bearer $CRON_SECRET` 调用同步接口。
- `THE_ODDS_API_KEY`：可选，用于同步 The Odds API 赔率；不配置时会跳过赔率同步。

`vercel.json` 已配置：

- `/world-cup` 和 `/world-cup/*` rewrite 到 Serverless API。
- 每 10 分钟执行一次 `/world-cup/api/cron/sync`，同步赛程、结算已完成比赛并同步赔率。

首次部署前，在 Vercel 项目里添加 KV 存储并绑定这些环境变量。没有 KV 时，本地仍会使用 `data/state.json`，但 Vercel 上的运行时写入不会可靠持久化。
