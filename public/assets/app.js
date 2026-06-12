const BASE_PATH = document.querySelector('meta[name="base-path"]')?.content || "/world-cup";
const els = {
  login: document.querySelector("#login-screen"),
  loading: document.querySelector("#auth-loading-screen"),
  loginForm: document.querySelector("#login-form"),
  loginError: document.querySelector("#login-error"),
  app: document.querySelector("#app-shell"),
  sideNav: document.querySelector("#side-nav"),
  betSlip: document.querySelector("#bet-slip"),
  profileInitial: document.querySelector("#profile-initial"),
  profileName: document.querySelector("#profile-name"),
  profileRole: document.querySelector("#profile-role"),
  chipBalance: document.querySelector("#chip-balance"),
  syncMeta: document.querySelector("#sync-meta"),
  stats: document.querySelector("#stats-strip"),
  matches: document.querySelector("#matches-grid"),
  selectedMatch: document.querySelector("#selected-match"),
  marketButtons: document.querySelector("#market-buttons"),
  multiplierButtons: document.querySelector("#multiplier-buttons"),
  stakeInput: document.querySelector("#stake-input"),
  payoutEstimate: document.querySelector("#payout-estimate"),
  submitBet: document.querySelector("#submit-bet"),
  cancelEdit: document.querySelector("#cancel-edit"),
  betError: document.querySelector("#bet-error"),
  betsList: document.querySelector("#bets-list"),
  betDashboard: document.querySelector("#bet-dashboard"),
  betsViewList: document.querySelector("#bets-view-list"),
  leaderboard: document.querySelector("#leaderboard"),
  bracket: document.querySelector("#bracket-board"),
  adminForm: document.querySelector("#admin-form"),
  configForm: document.querySelector("#config-form"),
  toast: document.querySelector("#toast")
};

const appState = {
  user: null,
  matches: [],
  groups: [],
  knockout: [],
  bets: [],
  leaderboard: [],
  sourceCache: null,
  selectedMatchId: null,
  selectedPick: "home",
  selectedMultiplier: 1,
  stake: 25,
  editingBetId: null,
  filter: "all",
  view: "matches",
  adminMatchId: null,
  adminConfig: null,
  polling: null
};

const marketLabels = {
  home: "主胜",
  draw: "平局",
  away: "客胜"
};

const statusLabels = {
  scheduled: "未开赛",
  live: "LIVE",
  awaiting: "待录入",
  finished: "已结束",
  cancelled: "已取消"
};

const betStatusLabels = {
  open: "待结算",
  settled: "已赢",
  lost: "未中",
  cancelled: "已取消",
  deducted: "已扣除"
};

const teamFlags = {
  "Algeria": "🇩🇿",
  "Argentina": "🇦🇷",
  "Australia": "🇦🇺",
  "Austria": "🇦🇹",
  "Belgium": "🇧🇪",
  "Bosnia & Herzegovina": "🇧🇦",
  "Brazil": "🇧🇷",
  "Canada": "🇨🇦",
  "Cape Verde": "🇨🇻",
  "Colombia": "🇨🇴",
  "Costa Rica": "🇨🇷",
  "Croatia": "🇭🇷",
  "Curaçao": "🇨🇼",
  "Czech Republic": "🇨🇿",
  "Denmark": "🇩🇰",
  "DR Congo": "🇨🇩",
  "Ecuador": "🇪🇨",
  "Egypt": "🇪🇬",
  "England": "🏴",
  "France": "🇫🇷",
  "Germany": "🇩🇪",
  "Ghana": "🇬🇭",
  "Haiti": "🇭🇹",
  "Iran": "🇮🇷",
  "Iraq": "🇮🇶",
  "Ivory Coast": "🇨🇮",
  "Japan": "🇯🇵",
  "Jordan": "🇯🇴",
  "Mexico": "🇲🇽",
  "Morocco": "🇲🇦",
  "Netherlands": "🇳🇱",
  "New Zealand": "🇳🇿",
  "Nigeria": "🇳🇬",
  "Norway": "🇳🇴",
  "Panama": "🇵🇦",
  "Paraguay": "🇵🇾",
  "Portugal": "🇵🇹",
  "Qatar": "🇶🇦",
  "Saudi Arabia": "🇸🇦",
  "Scotland": "🏴",
  "Senegal": "🇸🇳",
  "South Africa": "🇿🇦",
  "South Korea": "🇰🇷",
  "Spain": "🇪🇸",
  "Sweden": "🇸🇪",
  "Switzerland": "🇨🇭",
  "Tunisia": "🇹🇳",
  "Turkey": "🇹🇷",
  "USA": "🇺🇸",
  "Uruguay": "🇺🇾",
  "Uzbekistan": "🇺🇿"
};

const teamNamesZh = {
  "Algeria": "阿尔及利亚",
  "Argentina": "阿根廷",
  "Australia": "澳大利亚",
  "Austria": "奥地利",
  "Belgium": "比利时",
  "Bosnia & Herzegovina": "波黑",
  "Brazil": "巴西",
  "Canada": "加拿大",
  "Cape Verde": "佛得角",
  "Colombia": "哥伦比亚",
  "Costa Rica": "哥斯达黎加",
  "Croatia": "克罗地亚",
  "Curaçao": "库拉索",
  "Czech Republic": "捷克",
  "Denmark": "丹麦",
  "DR Congo": "刚果民主共和国",
  "Ecuador": "厄瓜多尔",
  "Egypt": "埃及",
  "England": "英格兰",
  "France": "法国",
  "Germany": "德国",
  "Ghana": "加纳",
  "Haiti": "海地",
  "Iran": "伊朗",
  "Iraq": "伊拉克",
  "Ivory Coast": "科特迪瓦",
  "Japan": "日本",
  "Jordan": "约旦",
  "Mexico": "墨西哥",
  "Morocco": "摩洛哥",
  "Netherlands": "荷兰",
  "New Zealand": "新西兰",
  "Nigeria": "尼日利亚",
  "Norway": "挪威",
  "Panama": "巴拿马",
  "Paraguay": "巴拉圭",
  "Portugal": "葡萄牙",
  "Qatar": "卡塔尔",
  "Saudi Arabia": "沙特阿拉伯",
  "Scotland": "苏格兰",
  "Senegal": "塞内加尔",
  "South Africa": "南非",
  "South Korea": "韩国",
  "Spain": "西班牙",
  "Sweden": "瑞典",
  "Switzerland": "瑞士",
  "Tunisia": "突尼斯",
  "Turkey": "土耳其",
  "USA": "美国",
  "Uruguay": "乌拉圭",
  "Uzbekistan": "乌兹别克斯坦"
};

let previousChipBalance = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN").format(Math.round(Number(value || 0)));
}

function teamFlag(team) {
  return teamFlags[team] || "◈";
}

function teamNameZh(team) {
  return teamNamesZh[team] || team || "待定";
}

function renderTeamText(team) {
  const zh = teamNameZh(team);
  const showEnglish = team && zh !== team;
  const fullName = plainTeamLabel(team);
  return `
    <span class="team-copy" title="${escapeHtml(fullName)}">
      <span class="team-copy-zh" title="${escapeHtml(fullName)}">${escapeHtml(zh)}</span>
      ${showEnglish ? `<small title="${escapeHtml(fullName)}">${escapeHtml(team)}</small>` : ""}
    </span>
  `;
}

function plainTeamLabel(team) {
  const zh = teamNameZh(team);
  return team && zh !== team ? `${zh} (${team})` : zh;
}

function renderTeamName(team, extraClass = "") {
  const known = Boolean(teamFlags[team]);
  const flag = teamFlag(team);
  return `
    <span class="team-with-flag ${extraClass}" data-flag="${escapeHtml(flag)}" title="${escapeHtml(plainTeamLabel(team))}">
      <span class="flag-chip ${known ? "" : "flag-placeholder"}">${escapeHtml(flag)}</span>
      ${renderTeamText(team)}
    </span>
  `;
}

function renderFlagAvatar(team) {
  return `<span class="team-flag-round" title="${escapeHtml(teamNameZh(team))}">${escapeHtml(teamFlag(team))}</span>`;
}

function betForMatch(matchId) {
  return appState.bets.find((bet) => bet.matchId === matchId && bet.status !== "cancelled") || null;
}

function animateNumber(el, from, to, suffix = "") {
  const start = performance.now();
  const duration = 850;
  const tick = (time) => {
    const progress = Math.min(1, (time - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(from + (to - from) * eased);
    const value = `${formatNumber(current)}${suffix}`;
    el.textContent = value;
    el.dataset.glitch = value;
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function formatOdds(value) {
  return Number(value || 0).toFixed(2);
}

function formatDate(iso) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(iso));
}

function formatFullDate(iso) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(iso));
}

function formatBetDateParts(iso) {
  const date = new Date(iso);
  return {
    month: new Intl.DateTimeFormat("en-US", { month: "short" }).format(date).toUpperCase(),
    day: String(date.getDate()).padStart(2, "0")
  };
}

function dayKey(iso) {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function formatDeltaPercent(current, previous) {
  if (!previous) return "暂无昨日数据";
  const delta = ((current - previous) / previous) * 100;
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(0)}% 较昨日`;
}

function shortBetId(id) {
  return String(id || "").slice(0, 6).toUpperCase();
}

function selectionLabel(bet, match) {
  if (bet.pick === "draw") return "平局";
  return teamNameZh(bet.pick === "home" ? match.team1 : match.team2);
}

function winnerLabel(match) {
  if (!match?.outcome) return "胜方待定";
  if (match.outcome === "draw") return "平局";
  return `${teamNameZh(match.outcome === "home" ? match.team1 : match.team2)} 胜`;
}

function returnLabel(bet) {
  if (bet.type === "auto-deduction") return `-${formatNumber(bet.stake)}`;
  if (bet.status === "settled") return `+${formatNumber(bet.payout)}`;
  if (bet.status === "lost") return "0";
  if (bet.status === "cancelled") return "已取消";
  return "待结算";
}

function calculateBetDashboard(bets) {
  const activeBets = bets.filter((bet) => bet.status !== "cancelled" && bet.type !== "auto-deduction");
  const settledBets = activeBets.filter((bet) => bet.status === "settled" || bet.status === "lost");
  const wonBets = activeBets.filter((bet) => bet.status === "settled");
  const totalWagered = activeBets.reduce((sum, bet) => sum + Number(bet.stake || 0), 0);
  const totalWon = wonBets.reduce((sum, bet) => sum + Number(bet.payout || 0), 0);
  const settledStake = settledBets.reduce((sum, bet) => sum + Number(bet.stake || 0), 0);
  const winRate = settledBets.length ? Math.round((wonBets.length / settledBets.length) * 100) : 0;
  const today = dayKey(new Date().toISOString());
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = dayKey(yesterdayDate.toISOString());
  const todayWagered = activeBets
    .filter((bet) => dayKey(bet.createdAt) === today)
    .reduce((sum, bet) => sum + Number(bet.stake || 0), 0);
  const yesterdayWagered = activeBets
    .filter((bet) => dayKey(bet.createdAt) === yesterday)
    .reduce((sum, bet) => sum + Number(bet.stake || 0), 0);
  const biggestWin = wonBets.reduce((best, bet) => (Number(bet.payout || 0) > Number(best?.payout || 0) ? bet : best), null);
  return {
    totalWagered,
    totalWon,
    winRate,
    wagerDelta: formatDeltaPercent(todayWagered, yesterdayWagered),
    growthPercent: settledStake ? `${((totalWon / settledStake) * 100).toFixed(1)}% 本金增长` : "暂无已结算本金",
    biggestWin
  };
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  let body = options.body;
  if (body && typeof body === "object") {
    headers["content-type"] = "application/json";
    body = JSON.stringify(body);
  }
  const response = await fetch(`${BASE_PATH}${path}`, {
    credentials: "include",
    ...options,
    headers,
    body
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "请求失败");
  }
  return payload;
}

function showLogin() {
  document.body.classList.remove("auth-loading");
  els.loading.classList.add("hidden");
  els.login.classList.remove("hidden");
  els.app.classList.add("hidden");
  if (appState.polling) clearInterval(appState.polling);
}

function showApp() {
  document.body.classList.remove("auth-loading");
  els.loading.classList.add("hidden");
  els.login.classList.add("hidden");
  els.app.classList.remove("hidden");
}

function toast(message, type = "success") {
  els.toast.innerHTML = `<div class="alert alert-${type}">${escapeHtml(message)}</div>`;
  setTimeout(() => {
    els.toast.innerHTML = "";
  }, 2600);
}

async function bootstrap({ silent = false, renderMode = "full" } = {}) {
  try {
    const data = await api("/api/bootstrap");
    applyBootstrap(data, { renderMode });
    showApp();
    if (!silent) toast("数据已更新");
  } catch (error) {
    if (!silent) els.loginError.textContent = error.message;
    showLogin();
  }
}

async function loadAdminConfig({ silent = false } = {}) {
  if (!isAdmin()) return;
  try {
    appState.adminConfig = await api("/api/admin/config");
    renderConfig();
    if (!silent) toast("配置已刷新");
  } catch (error) {
    toast(error.message, "error");
  }
}

function applyBootstrap(data, { renderMode = "full" } = {}) {
  appState.user = data.user;
  appState.matches = data.matches || [];
  appState.groups = data.groups || [];
  appState.knockout = data.knockout || [];
  appState.bets = data.bets || [];
  appState.leaderboard = data.leaderboard || [];
  appState.sourceCache = data.sourceCache || null;

  const selectedStillExists = appState.matches.some((match) => match.id === appState.selectedMatchId);
  if (!selectedStillExists) {
    const firstOpen = appState.matches.find((match) => !match.locked) || appState.matches[0];
    appState.selectedMatchId = firstOpen?.id || null;
  }
  if (!appState.adminMatchId) {
    appState.adminMatchId = appState.selectedMatchId;
  }
  if (renderMode === "data") {
    renderDataRegions();
  } else {
    render();
  }
  if (isAdmin() && appState.view === "config" && !appState.adminConfig) {
    loadAdminConfig({ silent: true });
  }
}

function selectedMatch() {
  return appState.matches.find((match) => match.id === appState.selectedMatchId) || null;
}

function selectedBet() {
  return appState.bets.find((bet) => bet.id === appState.editingBetId) || null;
}

function setSlipCollapsed(collapsed) {
  els.betSlip.classList.toggle("collapsed", collapsed);
  els.app.classList.toggle("slip-collapsed", collapsed);
}

function isAdmin() {
  return appState.user?.role === "admin";
}

function render() {
  renderShell();
  renderView();
  renderStats();
  renderMatches();
  renderSlip();
  renderBets();
  renderLeaderboard();
  renderBracket();
  renderAdmin();
}

function renderDataRegions() {
  renderShell();
  renderStats();
  renderMatches();
  renderBets();
  renderLeaderboard();
  renderBracket();
}

function renderShell() {
  if (!appState.user) return;
  els.profileInitial.textContent = appState.user.name.slice(0, 1).toUpperCase();
  els.profileName.textContent = appState.user.name;
  els.profileRole.textContent = appState.user.role === "admin" ? "Admin Tier" : "Elite Tier";
  const nextChips = Number(appState.user.chips || 0);
  if (previousChipBalance === null) {
    els.chipBalance.classList.add("rolling");
    animateNumber(els.chipBalance, 0, nextChips);
    setTimeout(() => els.chipBalance.classList.remove("rolling"), 950);
  } else if (previousChipBalance !== nextChips) {
    els.chipBalance.classList.add("rolling");
    animateNumber(els.chipBalance, previousChipBalance, nextChips);
    setTimeout(() => els.chipBalance.classList.remove("rolling"), 950);
  } else {
    els.chipBalance.dataset.glitch = els.chipBalance.textContent;
  }
  previousChipBalance = nextChips;
  els.syncMeta.textContent = appState.sourceCache?.lastSyncedAt
    ? `赛程同步：${formatFullDate(appState.sourceCache.lastSyncedAt)}`
    : "赛程待同步";
  document.querySelectorAll(".admin-only").forEach((node) => {
    node.classList.toggle("hidden", !isAdmin());
  });
  document.querySelectorAll("[data-view]").forEach((node) => {
    node.classList.toggle("active", node.dataset.view === appState.view);
  });
}

function renderView() {
  document.querySelectorAll(".view-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `view-${appState.view}`);
  });
}

function renderStats() {
  const total = appState.matches.length;
  const live = appState.matches.filter((match) => match.status === "live").length;
  const upcoming = appState.matches.filter((match) => match.status === "scheduled").length;
  const openBets = appState.bets.filter((bet) => bet.status === "open").length;
  els.stats.innerHTML = [
    ["全部比赛", total],
    ["LIVE", live],
    ["未开赛", upcoming],
    ["待处理注单", openBets]
  ]
    .map(([label, value]) => `<div class="stat-card"><span>${label}</span><strong>${formatNumber(value)}</strong></div>`)
    .join("");
}

function renderMatches() {
  const visible = appState.matches.filter((match) => appState.filter === "all" || match.status === appState.filter);
  if (!visible.length) {
    els.matches.innerHTML = `<div class="empty-state">当前筛选下没有比赛</div>`;
    return;
  }
  els.matches.innerHTML = visible.map(renderMatchCard).join("");
}

function renderMatchCard(match) {
  const isSelected = match.id === appState.selectedMatchId;
  const statusClass = `status-${match.status}`;
  const groupLine = match.group ? `${match.group} · ${match.ground}` : `${match.round} · ${match.ground}`;
  const existingBet = betForMatch(match.id);
  return `
    <article class="match-card ${isSelected ? "selected" : ""} ${match.locked ? "locked" : ""} ${existingBet ? "already-bet" : ""}">
      <div class="match-top">
        <span>${escapeHtml(groupLine)}</span>
        <span class="status-badge ${existingBet ? "status-bet" : statusClass}">${existingBet ? "已下注" : statusLabels[match.status] || match.status}</span>
      </div>
      <div class="teams-row">
        <div class="team">
          <span class="team-tag">${escapeHtml(match.round)}</span>
          <span class="team-name ${match.outcome === "home" ? "winner" : ""}">${renderTeamName(match.team1)}</span>
        </div>
        <div class="score-box">
          <strong>${escapeHtml(match.scoreText)}</strong>
          <span>${formatDate(match.startAt)}</span>
        </div>
        <div class="team away">
          <span class="team-tag">#${escapeHtml(match.displayNo)}</span>
          <span class="team-name ${match.outcome === "away" ? "winner" : ""}">${renderTeamName(match.team2)}</span>
        </div>
      </div>
      <div class="market-row">
        ${renderOddButton(match, "home")}
        ${renderOddButton(match, "draw")}
        ${renderOddButton(match, "away")}
      </div>
    </article>
  `;
}

function renderOddButton(match, pick) {
  const active = appState.selectedMatchId === match.id && appState.selectedPick === pick;
  const existingBet = betForMatch(match.id);
  return `
    <button class="odd-button ${active ? "active" : ""}" data-action="select-market" data-match-id="${match.id}" data-pick="${pick}" type="button" ${existingBet ? "disabled" : ""}>
      <small>${marketLabels[pick]}</small>
      ${formatOdds(match.odds[pick])}
    </button>
  `;
}

function renderSlip() {
  const match = selectedMatch();
  const bet = selectedBet();
  if (!match) {
    els.selectedMatch.className = "selected-match empty";
    els.selectedMatch.textContent = "请选择一场比赛";
    els.marketButtons.innerHTML = "";
    els.multiplierButtons.innerHTML = "";
    els.submitBet.disabled = true;
    return;
  }
  const existingBet = betForMatch(match.id);
  const duplicateBlocked = existingBet && !appState.editingBetId;

  els.selectedMatch.className = "selected-match";
  els.selectedMatch.innerHTML = `
    <div class="record-top">
      <div>
        <div class="record-title">${renderTeamName(match.team1)} <span class="versus">vs</span> ${renderTeamName(match.team2)}</div>
        <div class="record-meta">${escapeHtml(match.round)} · ${formatFullDate(match.startAt)}</div>
      </div>
      <span class="status-badge ${duplicateBlocked ? "status-bet" : `status-${match.status}`}">${duplicateBlocked ? "已下注" : statusLabels[match.status]}</span>
    </div>
  `;
  els.marketButtons.innerHTML = ["home", "draw", "away"]
    .map((pick) => renderSlipMarketButton(match, pick))
    .join("");
  els.multiplierButtons.innerHTML = [1, 25, 50].map((value) => renderQuickStakeButton(value)).join("");
  els.stakeInput.value = appState.stake;
  els.cancelEdit.classList.toggle("hidden", !appState.editingBetId);
  els.submitBet.textContent = appState.editingBetId ? "保存修改" : duplicateBlocked ? "已下注" : "确认下注";
  els.submitBet.disabled = match.locked || match.status === "finished" || duplicateBlocked;
  els.betError.textContent = duplicateBlocked ? "每个场次只能下注一次，可在最近记录中修改未开赛注单。" : "";
  updateEstimate();
}

function renderSlipMarketButton(match, pick) {
  return `
    <button class="odd-button ${appState.selectedPick === pick ? "active" : ""}" data-action="select-slip-pick" data-pick="${pick}" type="button">
      <small>${marketLabels[pick]}</small>
      ${formatOdds(match.odds[pick])}
    </button>
  `;
}

function renderQuickStakeButton(value) {
  const active = Number(appState.stake) === value;
  return `
    <button class="multiplier-btn quick-stake-btn ${active ? "active" : ""}" data-action="select-quick-stake" data-stake="${value}" type="button">
      <span class="multiplier-state">${active ? "SELECTED" : "QUICK"}</span>
      <span class="multiplier-main">${value} <small>筹码</small></span>
      <span class="multiplier-watermark">${value}</span>
    </button>
  `;
}

function updateEstimate() {
  const match = selectedMatch();
  if (!match) {
    els.payoutEstimate.textContent = "0";
    return;
  }
  appState.stake = Number(els.stakeInput.value || appState.stake || 0);
  const odds = match.odds[appState.selectedPick] || 0;
  const payout = appState.stake * odds;
  els.payoutEstimate.textContent = `${formatNumber(payout)} 筹码`;
}

function renderBets() {
  renderBetDashboard();
  const compactContent = appState.bets.length
    ? appState.bets.map(renderBetRecord).join("")
    : `<div class="empty-state">还没有投注记录</div>`;
  const historyContent = appState.bets.length
    ? appState.bets.map(renderBetHistoryCard).join("")
    : `<div class="empty-state bet-history-empty">暂无投注记录</div>`;
  els.betsList.innerHTML = compactContent;
  els.betsViewList.innerHTML = historyContent;
}

function renderBetDashboard() {
  if (!els.betDashboard) return;
  const summary = calculateBetDashboard(appState.bets);
  const biggestMatch = summary.biggestWin?.match
    || appState.matches.find((item) => item.id === summary.biggestWin?.matchId)
    || null;
  const biggestMatchLabel = biggestMatch
    ? `${teamNameZh(biggestMatch.team1)} vs ${teamNameZh(biggestMatch.team2)}`
    : "暂无赢单";
  els.betDashboard.innerHTML = `
    <article class="bet-metric">
      <span>TOTAL WAGERED</span>
      <strong>${formatNumber(summary.totalWagered)}</strong>
      <small>${escapeHtml(summary.wagerDelta)}</small>
    </article>
    <article class="bet-metric featured">
      <span>TOTAL WON</span>
      <strong>${formatNumber(summary.totalWon)}</strong>
      <small>${escapeHtml(summary.growthPercent)}</small>
    </article>
    <article class="bet-metric">
      <span>WIN RATE</span>
      <strong>${summary.winRate}%</strong>
      <div class="metric-progress"><span style="width:${Math.min(100, summary.winRate)}%"></span></div>
    </article>
    <article class="bet-metric">
      <span>BIGGEST WIN</span>
      <strong>${summary.biggestWin ? formatNumber(summary.biggestWin.payout) : "0"}</strong>
      <small>${escapeHtml(biggestMatchLabel)}</small>
    </article>
  `;
}

function renderBetHistoryCard(bet) {
  if (bet.type === "auto-deduction") return renderAutoDeductionHistoryCard(bet);
  const match = bet.match || appState.matches.find((item) => item.id === bet.matchId) || {};
  const parts = formatBetDateParts(bet.createdAt || match.startAt || new Date().toISOString());
  const canEdit = bet.status === "open" && !match.locked;
  const pickedTeam = selectionLabel(bet, match);
  const statusClass = `history-status-${bet.status}`;
  return `
    <article class="bet-history-card ${bet.status}">
      <div class="history-date">
        <span>${escapeHtml(parts.month)}</span>
        <strong>${escapeHtml(parts.day)}</strong>
      </div>
      <div class="history-main">
        <div class="history-headline">
          <span class="history-type">胜负竞猜</span>
          <span class="history-id">ID: #${escapeHtml(shortBetId(bet.id))}</span>
        </div>
        <div class="history-match">
          <span class="history-team">${renderFlagAvatar(match.team1)}${renderTeamText(match.team1)}</span>
          <b>vs</b>
          <span class="history-team">${renderFlagAvatar(match.team2)}${renderTeamText(match.team2)}</span>
        </div>
        <div class="history-winner">${escapeHtml(winnerLabel(match))}</div>
      </div>
      <div class="history-detail">
        <span>押注</span>
        <strong>${escapeHtml(pickedTeam || marketLabels[bet.pick] || "未知")}</strong>
      </div>
      <div class="history-detail">
        <span>赔率</span>
        <strong>${formatOdds(bet.odds)}</strong>
      </div>
      <div class="history-detail">
        <span>筹码</span>
        <strong>${formatNumber(bet.stake)}</strong>
      </div>
      <div class="history-detail history-return">
        <span>返回</span>
        <strong>${escapeHtml(returnLabel(bet))}</strong>
      </div>
      <div class="history-actions">
        <span class="history-status ${statusClass}">${betStatusLabels[bet.status]}</span>
        ${canEdit ? `
          <button class="btn btn-xs btn-outline" data-action="edit-bet" data-bet-id="${bet.id}" type="button">修改</button>
          <button class="btn btn-xs btn-ghost" data-action="cancel-bet" data-bet-id="${bet.id}" type="button">取消</button>
        ` : ""}
      </div>
    </article>
  `;
}

function renderBetRecord(bet) {
  if (bet.type === "auto-deduction") return renderAutoDeductionRecord(bet);
  const match = bet.match || appState.matches.find((item) => item.id === bet.matchId) || {};
  const canEdit = bet.status === "open" && !match.locked;
  const payout = bet.status === "settled" ? `+${formatNumber(bet.payout)}` : bet.status === "lost" ? "-0" : "待结算";
  return `
    <article class="bet-record ${bet.status}">
      <div class="record-top">
        <div class="record-title">${renderTeamName(match.team1 || "待定")} <span class="versus">vs</span> ${renderTeamName(match.team2 || "待定")}</div>
        <strong>${escapeHtml(payout)}</strong>
      </div>
      <div class="record-meta">
        ${marketLabels[bet.pick]} · ${formatNumber(bet.stake)} 筹码 · ${formatOdds(bet.odds)} · ${betStatusLabels[bet.status]}
      </div>
      ${canEdit ? `
        <div class="record-actions">
          <button class="btn btn-xs btn-outline" data-action="edit-bet" data-bet-id="${bet.id}" type="button">修改</button>
          <button class="btn btn-xs btn-ghost" data-action="cancel-bet" data-bet-id="${bet.id}" type="button">取消</button>
        </div>
      ` : ""}
    </article>
  `;
}

function renderAutoDeductionHistoryCard(bet) {
  const match = bet.match || appState.matches.find((item) => item.id === bet.matchId) || {};
  const parts = formatBetDateParts(bet.createdAt || match.startAt || new Date().toISOString());
  return `
    <article class="bet-history-card deducted">
      <div class="history-date">
        <span>${escapeHtml(parts.month)}</span>
        <strong>${escapeHtml(parts.day)}</strong>
      </div>
      <div class="history-main">
        <div class="history-headline">
          <span class="history-type">自动扣除</span>
          <span class="history-id">ID: #${escapeHtml(shortBetId(bet.id))}</span>
        </div>
        <div class="history-match">
          <span class="history-team">${renderFlagAvatar(match.team1)}${renderTeamText(match.team1 || "待定")}</span>
          <b>vs</b>
          <span class="history-team">${renderFlagAvatar(match.team2)}${renderTeamText(match.team2 || "待定")}</span>
        </div>
        <div class="history-winner">${escapeHtml(bet.reason || "比赛开始未下注，自动扣除 25 筹码")}</div>
      </div>
      <div class="history-detail">
        <span>扣除</span>
        <strong>-${formatNumber(bet.stake)}</strong>
      </div>
      <div class="history-detail history-return">
        <span>原因</span>
        <strong>未下注</strong>
      </div>
      <div class="history-actions">
        <span class="history-status history-status-deducted">${betStatusLabels[bet.status] || "已扣除"}</span>
      </div>
    </article>
  `;
}

function renderAutoDeductionRecord(bet) {
  const match = bet.match || appState.matches.find((item) => item.id === bet.matchId) || {};
  return `
    <article class="bet-record deducted">
      <div class="record-top">
        <div class="record-title">${renderTeamName(match.team1 || "待定")} <span class="versus">vs</span> ${renderTeamName(match.team2 || "待定")}</div>
        <strong>-${formatNumber(bet.stake)}</strong>
      </div>
      <div class="record-meta">
        ${escapeHtml(bet.reason || "比赛开始未下注，自动扣除 25 筹码")} · ${betStatusLabels[bet.status] || "已扣除"}
      </div>
    </article>
  `;
}

function renderLeaderboard() {
  els.leaderboard.innerHTML = appState.leaderboard
    .map((user, index) => `
      <div class="leader-row">
        <span>${index + 1}. ${escapeHtml(user.name)}</span>
        <strong>${formatNumber(user.chips)}</strong>
      </div>
    `)
    .join("");
}

function renderBracket() {
  const left = appState.groups.slice(0, 6);
  const right = appState.groups.slice(6);
  const finalMatch = appState.matches.find((match) => match.round === "Final");
  els.bracket.innerHTML = `
    <div class="bracket-grid">
      <div class="group-stack">${left.map(renderGroupCard).join("")}</div>
      <div class="trophy-card">
        <img src="./assets/trophy.svg" alt="冠军奖杯">
        <div>
          <h4>大力神杯之路</h4>
          <p class="record-meta">${finalMatch ? `${escapeHtml(plainTeamLabel(finalMatch.team1))} vs ${escapeHtml(plainTeamLabel(finalMatch.team2))} · ${formatDate(finalMatch.startAt)}` : "决赛待定"}</p>
        </div>
      </div>
      <div class="group-stack">${right.map(renderGroupCard).join("")}</div>
    </div>
    <div class="knockout-grid">${appState.knockout.map(renderRoundColumn).join("")}</div>
  `;
}

function renderGroupCard(group) {
  return `
    <article class="group-card">
      <h4>${escapeHtml(group.name.replace("Group", "小组"))}</h4>
      <div class="team-table">
        ${group.teams.map((team) => `
          <div class="team-row">
            <span>${renderTeamName(team.name)}</span>
            <strong>${team.points}分</strong>
          </div>
        `).join("")}
      </div>
      ${group.matches.slice(0, 3).map(renderMiniMatch).join("")}
    </article>
  `;
}

function renderMiniMatch(match) {
  return `
    <div class="mini-match">
      <span class="${match.outcome === "home" ? "winner" : ""}">${renderTeamName(match.team1)}</span>
      <strong>${escapeHtml(match.scoreText)}</strong>
      <span class="${match.outcome === "away" ? "winner" : ""}">${renderTeamName(match.team2)}</span>
    </div>
  `;
}

function renderRoundColumn(round) {
  return `
    <section class="round-column">
      <h4>${escapeHtml(round.round)}</h4>
      ${round.matches.map((match) => `
        <div class="ko-match">
          <div class="record-meta">#${escapeHtml(match.displayNo)} · ${formatDate(match.startAt)}</div>
          <div class="ko-teams">
            <div class="ko-team ${match.outcome === "home" ? "winner" : ""}">
              <span>${renderTeamName(match.team1)}</span><span>${match.outcome === "home" ? "胜" : ""}</span>
            </div>
            <div class="ko-team ${match.outcome === "away" ? "winner" : ""}">
              <span>${renderTeamName(match.team2)}</span><span>${match.outcome === "away" ? "胜" : ""}</span>
            </div>
          </div>
        </div>
      `).join("")}
    </section>
  `;
}

function renderAdmin() {
  if (!isAdmin()) return;
  const match = appState.matches.find((item) => item.id === appState.adminMatchId) || selectedMatch() || appState.matches[0];
  if (!match) {
    els.adminForm.innerHTML = `<div class="empty-state wide">没有可管理的比赛</div>`;
    return;
  }
  appState.adminMatchId = match.id;
  const score = match.score?.ft || match.score?.et || match.score?.p || ["", ""];
  els.adminForm.innerHTML = `
    <label class="form-control wide">
      <span class="label-text">比赛</span>
      <select id="admin-match-select" class="select select-bordered">
        ${appState.matches.map((item) => `
          <option value="${item.id}" ${item.id === match.id ? "selected" : ""}>
            #${escapeHtml(item.displayNo)} ${escapeHtml(plainTeamLabel(item.team1))} vs ${escapeHtml(plainTeamLabel(item.team2))} · ${escapeHtml(item.round)}
          </option>
        `).join("")}
      </select>
    </label>
    <label class="form-control one">
      <span class="label-text">${escapeHtml(plainTeamLabel(match.team1))} 比分</span>
      <input id="admin-score-home" class="input input-bordered" type="number" min="0" value="${score[0]}">
    </label>
    <label class="form-control one">
      <span class="label-text">${escapeHtml(plainTeamLabel(match.team2))} 比分</span>
      <input id="admin-score-away" class="input input-bordered" type="number" min="0" value="${score[1]}">
    </label>
    <label class="form-control one">
      <span class="label-text">主胜赔率</span>
      <input id="admin-odds-home" class="input input-bordered" type="number" min="1" step="0.01" value="${formatOdds(match.odds.home)}">
    </label>
    <label class="form-control one">
      <span class="label-text">平局赔率</span>
      <input id="admin-odds-draw" class="input input-bordered" type="number" min="1" step="0.01" value="${formatOdds(match.odds.draw)}">
    </label>
    <label class="form-control one">
      <span class="label-text">客胜赔率</span>
      <input id="admin-odds-away" class="input input-bordered" type="number" min="1" step="0.01" value="${formatOdds(match.odds.away)}">
    </label>
    <label class="form-control one">
      <span class="label-text">状态</span>
      <select id="admin-status" class="select select-bordered">
        ${["scheduled", "finished", "cancelled"].map((status) => `<option value="${status}" ${match.status === status ? "selected" : ""}>${statusLabels[status]}</option>`).join("")}
      </select>
    </label>
    <label class="form-control two">
      <span class="label-text">赛果</span>
      <select id="admin-winner" class="select select-bordered">
        <option value="">按比分判断</option>
        <option value="home" ${match.outcome === "home" ? "selected" : ""}>${escapeHtml(plainTeamLabel(match.team1))} 胜</option>
        <option value="draw" ${match.outcome === "draw" ? "selected" : ""}>平局</option>
        <option value="away" ${match.outcome === "away" ? "selected" : ""}>${escapeHtml(plainTeamLabel(match.team2))} 胜</option>
      </select>
    </label>
    <button class="btn btn-primary two" type="submit">保存并结算</button>
  `;
}

function renderConfig() {
  if (!isAdmin() || !els.configForm) return;
  if (!appState.adminConfig) {
    els.configForm.innerHTML = `<div class="empty-state wide">点击“刷新配置”载入当前配置</div>`;
    return;
  }
  const { users, tournament } = appState.adminConfig;
  els.configForm.innerHTML = `
    <div class="config-card wide">
      <h4>赛事基础配置</h4>
      <div class="config-grid">
        <label class="form-control config-wide">
          <span class="label-text">2026 赛程源 URL</span>
          <input name="sourceUrl" class="input input-bordered" value="${escapeHtml(tournament.sourceUrl)}">
        </label>
        <label class="form-control">
          <span class="label-text">比赛锁定时长/分钟</span>
          <input name="matchDurationMinutes" class="input input-bordered" type="number" min="1" value="${escapeHtml(tournament.matchDurationMinutes)}">
        </label>
        <label class="form-control">
          <span class="label-text">默认主胜赔率</span>
          <input name="defaultOddsHome" class="input input-bordered" type="number" min="1" step="0.01" value="${formatOdds(tournament.defaultOdds.home)}">
        </label>
        <label class="form-control">
          <span class="label-text">默认平局赔率</span>
          <input name="defaultOddsDraw" class="input input-bordered" type="number" min="1" step="0.01" value="${formatOdds(tournament.defaultOdds.draw)}">
        </label>
        <label class="form-control">
          <span class="label-text">默认客胜赔率</span>
          <input name="defaultOddsAway" class="input input-bordered" type="number" min="1" step="0.01" value="${formatOdds(tournament.defaultOdds.away)}">
        </label>
      </div>
      <p class="record-meta">默认赔率会用于未单独配置赔率的比赛；已经手动改过赔率的比赛仍以“结果管理”为准。</p>
    </div>
    <div class="config-card wide">
      <div class="record-top">
        <h4>登录账号</h4>
        <button class="btn btn-xs btn-outline" data-action="add-config-user" type="button">新增账号</button>
      </div>
      <div class="user-config-list">
        ${users.map(renderConfigUser).join("")}
      </div>
    </div>
    <button class="btn btn-primary wide" type="submit">保存系统配置</button>
  `;
}

function renderConfigUser(user, index) {
  return `
    <div class="config-user" data-config-user="${index}">
      <label class="form-control">
        <span class="label-text">用户ID</span>
        <input data-field="id" class="input input-bordered" value="${escapeHtml(user.id)}">
      </label>
      <label class="form-control">
        <span class="label-text">账号</span>
        <input data-field="username" class="input input-bordered" value="${escapeHtml(user.username)}">
      </label>
      <label class="form-control">
        <span class="label-text">固定密码</span>
        <input data-field="password" class="input input-bordered" value="${escapeHtml(user.password)}">
      </label>
      <label class="form-control">
        <span class="label-text">显示名</span>
        <input data-field="name" class="input input-bordered" value="${escapeHtml(user.name)}">
      </label>
      <label class="form-control">
        <span class="label-text">角色</span>
        <select data-field="role" class="select select-bordered">
          <option value="player" ${user.role !== "admin" ? "selected" : ""}>玩家</option>
          <option value="admin" ${user.role === "admin" ? "selected" : ""}>管理员</option>
        </select>
      </label>
      <label class="form-control">
        <span class="label-text">筹码</span>
        <input data-field="initialChips" class="input input-bordered" type="number" min="0" value="${escapeHtml(user.initialChips)}">
      </label>
      <button class="btn btn-ghost btn-sm" data-action="remove-config-user" data-index="${index}" type="button">删除</button>
    </div>
  `;
}

function readConfigForm() {
  const form = new FormData(els.configForm);
  const users = [...els.configForm.querySelectorAll("[data-config-user]")].map((row) => ({
    id: row.querySelector('[data-field="id"]').value,
    username: row.querySelector('[data-field="username"]').value,
    password: row.querySelector('[data-field="password"]').value,
    name: row.querySelector('[data-field="name"]').value,
    role: row.querySelector('[data-field="role"]').value,
    initialChips: Number(row.querySelector('[data-field="initialChips"]').value)
  }));
  return {
    tournament: {
      sourceUrl: form.get("sourceUrl"),
      matchDurationMinutes: Number(form.get("matchDurationMinutes")),
      defaultOdds: {
        home: Number(form.get("defaultOddsHome")),
        draw: Number(form.get("defaultOddsDraw")),
        away: Number(form.get("defaultOddsAway"))
      }
    },
    users
  };
}

async function login(event) {
  event.preventDefault();
  els.loginError.textContent = "";
  const data = new FormData(event.currentTarget);
  try {
    await api("/api/login", {
      method: "POST",
      body: {
        username: data.get("username"),
        password: data.get("password")
      }
    });
    await bootstrap({ silent: true });
    startPolling();
  } catch (error) {
    els.loginError.textContent = error.message;
  }
}

async function submitBet(event) {
  event.preventDefault();
  const match = selectedMatch();
  if (!match) return;
  els.betError.textContent = "";
  if (betForMatch(match.id) && !appState.editingBetId) {
    els.betError.textContent = "每个场次只能下注一次，可在最近记录中修改未开赛注单。";
    return;
  }
  const stake = Number(els.stakeInput.value);
  if (!Number.isInteger(stake) || stake < 1 || stake > 50) {
    els.betError.textContent = "投注金额必须为 1-50 的整数";
    return;
  }
  try {
    const payload = {
      matchId: match.id,
      pick: appState.selectedPick,
      stake,
      multiplier: 1
    };
    const response = appState.editingBetId
      ? await api(`/api/bets/${appState.editingBetId}`, { method: "PATCH", body: payload })
      : await api("/api/bets", { method: "POST", body: payload });
    appState.editingBetId = null;
    applyBootstrap(response.bootstrap, { renderMode: "data" });
    toast("注单已保存");
  } catch (error) {
    els.betError.textContent = error.message;
  }
}

async function submitAdmin(event) {
  event.preventDefault();
  const matchId = appState.adminMatchId;
  try {
    const homeScore = document.querySelector("#admin-score-home").value;
    const awayScore = document.querySelector("#admin-score-away").value;
    const body = {
      status: document.querySelector("#admin-status").value,
      winner: document.querySelector("#admin-winner").value || undefined,
      odds: {
        home: Number(document.querySelector("#admin-odds-home").value),
        draw: Number(document.querySelector("#admin-odds-draw").value),
        away: Number(document.querySelector("#admin-odds-away").value)
      }
    };
    if (homeScore !== "" && awayScore !== "") {
      body.score = { home: Number(homeScore), away: Number(awayScore) };
    }
    const response = await api(`/api/admin/matches/${matchId}`, { method: "PATCH", body });
    applyBootstrap(response.bootstrap, { renderMode: "data" });
    toast("赛果和赔率已保存");
  } catch (error) {
    toast(error.message, "error");
  }
}

async function submitConfig(event) {
  event.preventDefault();
  try {
    const response = await api("/api/admin/config", {
      method: "PUT",
      body: readConfigForm()
    });
    appState.adminConfig = response.config;
    applyBootstrap(response.bootstrap, { renderMode: "data" });
    renderConfig();
    toast("系统配置已保存");
  } catch (error) {
    toast(error.message, "error");
  }
}

function startPolling() {
  if (appState.polling) clearInterval(appState.polling);
  appState.polling = setInterval(() => bootstrap({ silent: true, renderMode: "data" }), 30000);
}

function bindEvents() {
  els.loginForm.addEventListener("submit", login);
  els.login.addEventListener("pointermove", (event) => {
    const rect = els.login.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    els.login.style.setProperty("--login-x", `${x}%`);
    els.login.style.setProperty("--login-y", `${y}%`);
    els.login.style.setProperty("--login-tilt-x", `${(50 - y) / 18}deg`);
    els.login.style.setProperty("--login-tilt-y", `${(x - 50) / 18}deg`);
  });
  els.login.addEventListener("pointerleave", () => {
    els.login.style.setProperty("--login-x", "50%");
    els.login.style.setProperty("--login-y", "50%");
    els.login.style.setProperty("--login-tilt-x", "0deg");
    els.login.style.setProperty("--login-tilt-y", "0deg");
  });
  document.querySelector("#bet-form").addEventListener("submit", submitBet);
  els.adminForm.addEventListener("submit", submitAdmin);
  els.configForm.addEventListener("submit", submitConfig);
  els.stakeInput.addEventListener("input", updateEstimate);
  els.adminForm.addEventListener("change", (event) => {
    if (event.target.id === "admin-match-select") {
      appState.adminMatchId = event.target.value;
      renderAdmin();
    }
  });

  document.body.addEventListener("click", async (event) => {
    const viewButton = event.target.closest("[data-view]");
    if (viewButton) {
      appState.view = viewButton.dataset.view;
      render();
      if (appState.view === "config" && isAdmin() && !appState.adminConfig) {
        loadAdminConfig({ silent: true });
      } else if (appState.view === "config" && isAdmin() && !els.configForm.children.length) {
        renderConfig();
      }
      return;
    }

    const filterButton = event.target.closest("[data-filter]");
    if (filterButton) {
      appState.filter = filterButton.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((node) => node.classList.toggle("active", node === filterButton));
      renderMatches();
      return;
    }

    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) return;
    const action = actionButton.dataset.action;

    if (action === "toggle-nav") {
      els.sideNav.classList.toggle("collapsed");
    }
    if (action === "toggle-slip") {
      setSlipCollapsed(!els.betSlip.classList.contains("collapsed"));
    }
    if (action === "select-market") {
      appState.selectedMatchId = actionButton.dataset.matchId;
      appState.selectedPick = actionButton.dataset.pick;
      appState.editingBetId = null;
      setSlipCollapsed(false);
      render();
    }
    if (action === "select-slip-pick") {
      appState.selectedPick = actionButton.dataset.pick;
      renderSlip();
      renderMatches();
    }
    if (action === "select-quick-stake") {
      appState.stake = Number(actionButton.dataset.stake);
      els.stakeInput.value = appState.stake;
      renderSlip();
    }
    if (action === "clear-edit") {
      appState.editingBetId = null;
      renderSlip();
    }
    if (action === "edit-bet") {
      const bet = appState.bets.find((item) => item.id === actionButton.dataset.betId);
      if (bet) {
        appState.editingBetId = bet.id;
        appState.selectedMatchId = bet.matchId;
        appState.selectedPick = bet.pick;
        appState.selectedMultiplier = 1;
        appState.stake = bet.stake;
        setSlipCollapsed(false);
        render();
      }
    }
    if (action === "cancel-bet") {
      try {
        const response = await api(`/api/bets/${actionButton.dataset.betId}`, { method: "DELETE" });
        applyBootstrap(response.bootstrap, { renderMode: "data" });
        toast("注单已取消");
      } catch (error) {
        toast(error.message, "error");
      }
    }
    if (action === "sync-schedule") {
      try {
        await api("/api/admin/sync", { method: "POST" });
        await bootstrap({ silent: true, renderMode: "data" });
        toast("赛程已同步");
      } catch (error) {
        toast(error.message, "error");
      }
    }
    if (action === "load-config") {
      await loadAdminConfig();
    }
    if (action === "add-config-user") {
      if (!appState.adminConfig) await loadAdminConfig({ silent: true });
      const nextIndex = appState.adminConfig.users.length + 1;
      appState.adminConfig.users.push({
        id: `player${nextIndex}`,
        username: `player${nextIndex}`,
        password: `player${nextIndex}2026`,
        name: `玩家${nextIndex}`,
        role: "player",
        initialChips: 5000
      });
      renderConfig();
    }
    if (action === "remove-config-user") {
      if (!appState.adminConfig) return;
      const index = Number(actionButton.dataset.index);
      appState.adminConfig.users.splice(index, 1);
      renderConfig();
    }
    if (action === "logout") {
      await api("/api/logout", { method: "POST" }).catch(() => {});
      appState.user = null;
      showLogin();
    }
  });
}

bindEvents();
bootstrap({ silent: true }).then(() => {
  if (appState.user) startPolling();
});
