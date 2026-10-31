import { CONFIG } from "./config.js";
import * as S from "./systems.js";
import * as F from "./formulas.js";
import * as UI from "./ui.js";
import * as Save from "./save.js";
import { STORY } from "./story.js";

const Decimal = window.Decimal;

let state = Save.getOrCreateState();
let lastTick = Date.now();
// ===== 剧情事件检查 =====
function checkStoryEvents(state) {
  if (!state.storySeen) state.storySeen = new Set();
  const seen = state.storySeen;
  const unlock = (id) => {
    if (seen.has(id)) return false;
    const arc = STORY.keyMoments?.[id] || STORY.archive.find(a => a.id === id);
    if (!arc) return false;
    seen.add(id);
    UI.log(state, `【${arc.title}】`, "story");
    for (const line of arc.lines) {
      UI.log(state, line, "story");
    }
    return true;
  };

  // 小学
  if (state.totalClicks >= 1) unlock("km_l1_first_click");
  if ((state.buildings[1]?.olympiad ?? 0) >= 1) unlock("km_l1_first_olympiad");
  if (state.speakers >= 10) unlock("km_l1_speaker10");

  // 初中
  if ((state.buildings[2]?.neg ?? 0) >= 1) unlock("km_l2_negative");
  if ((state.resetCounts[2] ?? 0) >= 1) unlock("km_l2_first_reset");
  if (state.lifetimeTotals[2]?.gte("1e6")) unlock("km_l2_equation_dream");

  // 高中
  if ((state.buildings[3]?.trig ?? 0) >= 1) unlock("km_l3_function_heart");
  if ((state.buildings[3]?.limit ?? 0) >= 1) unlock("km_l3_limit_door");
  if ((state.currencies[3]?.gte("1e8")) && (state.buildings[3]?.limit ?? 0) === 0) {
    unlock("km_l3_bottleneck");
  }

  // 大学
  if ((state.buildings[4]?.integral ?? 0) >= 1) unlock("km_l4_infinite");
  if ((state.resetCounts[4] ?? 0) >= 1) unlock("km_l4_workbook_past");
  // 回望：大学升级 u_taylor 需要回头消耗代数币（在 config 里已配），买下即触发
  if (state.upgrades[4]?.has("u_taylor")) unlock("km_l4_callback");

  // 研究生
  if ((state.buildings[5]?.topo ?? 0) >= 1) unlock("km_l5_structure");
  if ((state.resetCounts[5] ?? 0) >= 1) unlock("km_l5_previous");
  if (state.kUpgrades.size >= 1) unlock("km_l5_k_upgrade");

  // 超限
  if ((state.buildings[6]?.unify ?? 0) >= 1) unlock("km_l6_unify");
  if (seen.has("ending")) unlock("km_l6_ending_echo");
}
// ===== 主循环 =====
function tick() {
  const now = Date.now();
  const dt = Math.min((now - lastTick) / 1000, 5); // 上限 5 秒，防切后台丢收益
  lastTick = now;
  

  // 1. 各层产出
  for (let stage = 1; stage <= state.currentStage; stage++) {
    const output = S.getStageOutput(state, stage);
    if (output.gt(0)) {
      const gain = output.times(dt);
      state.currencies[stage] = state.currencies[stage].plus(gain);
      state.totals[stage] = state.totals[stage].plus(gain);
      state.lifetimeTotals[stage] = state.lifetimeTotals[stage].plus(gain);
    }
  }

  // 2. 扬声器自动获取（给当前层）
  if (state.speakers > 0) {
    const curOutput = S.getStageOutput(state, state.currentStage);
    const extraMult = state.speakerUpgrades.has("sp_auto2") ? 2 : 1;
    const autoGain = F.speakerAutoGain(curOutput, state.speakers, extraMult);
    if (autoGain.gt(0)) {
      const g = autoGain.times(dt);
      const stage = state.currentStage;
      state.currencies[stage] = state.currencies[stage].plus(g);
      state.totals[stage] = state.totals[stage].plus(g);
      state.lifetimeTotals[stage] = state.lifetimeTotals[stage].plus(g);
    }
  }

  // 3. 自动点击（若解锁）
  if (state.automations.has("autoClick")) {
    const gain = new Decimal(1).times(dt); // 每秒 1 次点击
    state.currencies[1] = state.currencies[1].plus(gain);
    state.totals[1] = state.totals[1].plus(gain);
    state.lifetimeTotals[1] = state.lifetimeTotals[1].plus(gain);
  }

  // 7. 检查成就 / 扬声器升级 / 自动化
  const newAch = S.checkAchievements(state);
  for (const a of newAch) {
    UI.log(state, `成就解锁：【${a.name}】 ${STORY.achievementNotes[a.id] ?? ""}`, "good");
  }
  const newSp = S.checkSpeakerUpgrades(state);
  for (const u of newSp) {
    UI.log(state, `喇叭升级：${u.name} — ${u.desc}`, "good");
  }
  const newAuto = S.checkAutomations(state);
  for (const a of newAuto) {
    UI.log(state, `自动化解锁：${a.name}`, "good");
  }
    // 7.5 剧情事件
  checkStoryEvents(state);

  // 8. 刷新 UI
  UI.updateAll(state);
}

// ===== 手动点击 =====
document.getElementById("click-btn").addEventListener("click", () => {
  const stage = 1;
  let gain = new Decimal(1);
  // 手指计数：点击 ×2
  if (state.upgrades[1].has("u_click")) gain = gain.times(2);
  // 成就乘数
  const s = state.unlockedAchievements.size;
  gain = gain.times(F.achievementMultiplier(s, state.k));
  // 全局乘数
  gain = gain.times(F.globalMultiplier(state.resetCounts, state.speakers));

  state.currencies[stage] = state.currencies[stage].plus(gain);
  state.totals[stage] = state.totals[stage].plus(gain);
  state.lifetimeTotals[stage] = state.lifetimeTotals[stage].plus(gain);
  state.totalClicks += 1;

  // 首次点击剧情
  if (state.totalClicks === 1) {
    state.storySeen.add("opening");
    for (const line of STORY.opening) {
      UI.log(state, line, "story");
    }
  }
});

// ===== 存档 =====
setInterval(() => {
  Save.saveGame(state);
}, 10000); // 每 10 秒存一次

window.addEventListener("beforeunload", () => {
  Save.saveGame(state);
});

// ===== 主循环定时器（可重启） =====
let tickTimer = null;

function startTickLoop() {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(tick, state.tickRate);
}

export function restartTickLoop() {
  startTickLoop();
}

window.__debug = {
  state,
  jumpTo(stage) {
    state.currentStage = stage;
    state.viewStage = stage;
    UI.updateAll(state);
  },
  give(currencyStage, amount) {
    state.currencies[currencyStage] = new Decimal(amount);
    state.totals[currencyStage] = new Decimal(amount);
    state.lifetimeTotals[currencyStage] = new Decimal(amount);
    UI.updateAll(state);
  },
  givePoints(stage, amount) {
    state.points[stage] = new Decimal(amount);
    UI.updateAll(state);
  },
  giveSpeakers(n) {
    state.speakers = n;
    UI.updateAll(state);
  },
  reset() {
    localStorage.removeItem("math_ladder_save_v1");
    location.reload();
  },
};

// ===== 自动化定时器（固定 50ms，与 UI 刷新速度无关） =====
const AUTO_TICK_MS = 50;
let autoTimer = null;

function autoTick() {
  if (state.automations.has("autoBuy")) {
    S.autoBuyAll(state);
  }
  if (state.automations.has("autoUpgrade")) {
    S.autoUpgradeAll(state);
  }
  S.autoConvertAll(state);
}

function startAutoLoop() {
  if (autoTimer) clearInterval(autoTimer);
  autoTimer = setInterval(autoTick, AUTO_TICK_MS);
}
// ===== 启动 =====
function start() {
  document.addEventListener("mousedown", (e) => {
    if (e.target.closest(".building, .upgrade, #click-btn, #reset-btn")) {
      e.preventDefault();
    }
  });

  // 修正 viewStage
  if (state.viewStage < 1 || state.viewStage > state.currentStage) {
    state.viewStage = state.currentStage;
  }

  // 首次进入剧情
  if (state.totalClicks === 0) {
    for (const line of STORY.opening) {
      UI.log(state, line, "story");
    }
  }
  UI.log(state, "数学阶梯已启动。点击「写下答案」开始。", "");

  if (!state.storySeen) state.storySeen = new Set();
  // 初始化弹窗

  UI.initHelp(state);
  UI.initStory(state);
  UI.initSettings(state, () => restartTickLoop());

  // 首次渲染
  UI.updateAll(state);

  // 启动主循环（按 state.tickRate）
// 启动主循环（按 state.tickRate）
  startTickLoop();
  // 启动自动化（固定 50ms）
  startAutoLoop();

  // 终局剧情
  if (state.currentStage === 6 && !state.storySeen.has("ending")) {
    if (state.currencies[6].gte("1e10")) {
      state.storySeen.add("ending");
      for (const line of STORY.ending) {
        UI.log(state, line, "story");
      }
    }
  }
}

start();