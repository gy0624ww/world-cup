import { refreshOpenBetOdds, roundAmount } from "../src/core.js";
import { loadConfig, loadState, saveState } from "../src/state.js";

const config = await loadConfig();
const state = await loadState(config);
const beforeUserChips = Object.values(state.users || {}).reduce(
  (sum, user) => roundAmount(sum + Number(user.chips || 0)),
  0
);
const beforeOpenCount = (state.bets || []).filter(
  (bet) => bet.type !== "auto-deduction" && bet.status === "open"
).length;

const summary = refreshOpenBetOdds(state, config);
const afterUserChips = Object.values(state.users || {}).reduce(
  (sum, user) => roundAmount(sum + Number(user.chips || 0)),
  0
);
const afterOpenCount = (state.bets || []).filter(
  (bet) => bet.type !== "auto-deduction" && bet.status === "open"
).length;
const chipDelta = roundAmount(afterUserChips - beforeUserChips);

if (summary.missingUserCount !== 0) {
  throw new Error(`存在 ${summary.missingUserCount} 笔无法退款的注单，已停止保存`);
}
if (chipDelta !== summary.refundedAmount) {
  throw new Error(`余额增量 ${chipDelta} 与退款总额 ${summary.refundedAmount} 不一致，已停止保存`);
}
if (beforeOpenCount - afterOpenCount !== summary.cancelledCount) {
  throw new Error("待结算注单数量变化与取消数量不一致，已停止保存");
}

await saveState(state);
console.log(JSON.stringify({
  ...summary,
  beforeOpenCount,
  afterOpenCount,
  beforeUserChips,
  afterUserChips,
  chipDelta
}, null, 2));
