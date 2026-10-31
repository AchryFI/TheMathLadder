import { CONFIG } from "./config.js";
import * as F from "./formulas.js";
import { STORY } from "./story.js";

const Decimal = window.Decimal;

// 获取某学段建筑数量
export function getCount(state, stage, buildingId) {
  return state.buildings[stage][buildingId] ?? 0;
}

// 判断建筑是否解锁
export function isUnlocked(state, stage, building) {
  if (!building.unlock) return true;
  return getCount(state, stage, building.unlock.id) >= building.unlock.count;
}

// 计算某建筑当前成本
export function getBuildingCost(state, stage, building) {
  const count = getCount(state, stage, building.id);
  let cost = F.buildingCost(building, count);
  // 补习班：成本 -10%
  if (state.speakerUpgrades.has("sp_cost")) cost = cost.times(0.9);
  // 题海战术（若有）：成本 -15%（这里先不实现，预留）
  return cost;
}

// 计算某建筑当前产出（每秒）
export function getBuildingOutput(state, stage, building) {
  const count = getCount(state, stage, building.id);
  if (count === 0) return new Decimal(0);
  const upgradeId = `u_${building.id}`;
  const upgradeMult = state.upgrades[stage].has(upgradeId) ? 2 : 1;
  // 期末冲刺：全层产出 ×2
  const allMult = state.speakerUpgrades.has("sp_allx2") ? 2 : 1;
  // 全局乘数
 // 全局乘数
  const globalMult = F.globalMultiplier(state.resetCounts, state.speakers);
  // 本层永久加成
  const rpMult = getResetProtectionMultiplier(state, stage);
  return F.buildingOutput(building, count, upgradeMult, allMult).times(globalMult).times(rpMult);
}

export function getStageOutput(state, stage) {
  const buildings = CONFIG.buildings[stage] ?? [];
  let total = new Decimal(0);
  for (const b of buildings) {
    total = total.plus(getBuildingOutput(state, stage, b));
  }
  if (stage === 1 && state.speakerUpgrades.has("sp_l1x15")) total = total.times(1.5);

  // 下层货币 e 值加成
  if (stage < 6) {
    const nextCur = state.currencies[stage + 1];
    total = total.times(F.crossLayerMultiplier(nextCur));
  }

  return total;
}

// 购买建筑
export function buyBuilding(state, stage, buildingId) {
  const building = CONFIG.buildings[stage].find((b) => b.id === buildingId);
  if (!building || !isUnlocked(state, stage, building)) return false;
  const cost = getBuildingCost(state, stage, building);
  if (state.currencies[stage].lt(cost)) return false;
  state.currencies[stage] = state.currencies[stage].minus(cost);
  state.buildings[stage][buildingId] = getCount(state, stage, buildingId) + 1;
  return true;
}

// 购买升级
export function buyUpgrade(state, stage, upgradeId) {
  const upgrade = CONFIG.upgrades[stage]?.find((u) => u.id === upgradeId);
  if (!upgrade) return false;
  if (state.upgrades[stage].has(upgradeId)) return false;
  if (state.currencies[stage].lt(upgrade.cost)) return false;
  state.currencies[stage] = state.currencies[stage].minus(upgrade.cost);
  state.upgrades[stage].add(upgradeId);
  return true;
}

// 购买 k 升级（研究生层）
export function buyKUpgrade(state, upgradeId) {
  const upgrade = CONFIG.kUpgrades.find((u) => u.id === upgradeId);
  if (!upgrade || state.kUpgrades.has(upgradeId)) return false;
  if (state.currencies[5].lt(upgrade.cost)) return false;
  state.currencies[5] = state.currencies[5].minus(upgrade.cost);
  state.kUpgrades.add(upgradeId);
  state.k += upgrade.kBonus;
  return true;
}

export function convert(state, stage) {
  if (stage >= 6) return false;
  const target = stage + 1;
  const n = state.convertCounts[target] ?? 0;
  const discount = state.speakerUpgrades.has("sp_convert") ? 0.9 : 1;
  const cost = F.convertCost(n, CONFIG.convertBase, CONFIG.convertGrowth, discount);
  if (state.currencies[stage].lt(cost)) return false;

  state.currencies[stage] = state.currencies[stage].minus(cost);
  state.currencies[target] = state.currencies[target].plus(1);
  state.totals[target] = state.totals[target].plus(1);
  state.lifetimeTotals[target] = state.lifetimeTotals[target].plus(1);
  state.convertCounts[target] = n + 1;
  return true;
}

// 计算重置可获得的点数
export function getResetGain(state, stage) {
  const params = CONFIG.resetParams[stage];
  // 用当前余额结算
  return F.resetPoints(state.currencies[stage], params.threshold, params.coefficient, params.exponent);
}

// 执行重置
export function doReset(state, stage) {
  const params = CONFIG.resetParams[stage];

  // 余额不足门槛，不能重置
  if (state.currencies[stage].lt(params.threshold)) {
    return { ok: false, gain: new Decimal(0), reason: "余额不足门槛" };
  }

  const gain = getResetGain(state, stage);
  if (gain.lte(0)) return { ok: false, gain: new Decimal(0), reason: "可得点数为 0" };

  // 错题本：保留 5% 货币
  let keep = new Decimal(0);
  if (state.speakerUpgrades.has("sp_keep")) keep = state.currencies[stage].times(0.05);

  // 重置本层
  state.currencies[stage] = keep;
  state.totals[stage] = keep;
  // 始终清空建筑和升级（保护升级只提供永久加成，不保留建筑）
  state.buildings[stage] = {};
  state.upgrades[stage].clear();

  state.points[stage] = state.points[stage].plus(gain);
  state.resetCounts[stage] += 1;
  state.speakers += 1;
  // 重置该学段作为目标层的转换价格（L2 重置 → L1→L2 价格归零）
  if (stage >= 2 && stage <= 6) {
    state.convertCounts[stage] = 0;
  }

  return { ok: true, gain };
}

// 购买下一学段入学
export function buyNextStage(state, stage) {
  if (stage >= 6) return false;
  const nextStage = stage + 1;
  const cost = CONFIG.stages[stage - 1].nextStageCost;
  console.log("[buyNextStage]", { stage, nextStage, cost, have: state.points[stage].toString(), currentStage: state.currentStage });
  if (state.points[stage].lt(cost)) {
    console.log("[buyNextStage] 点数不足");
    return false;
  }
  state.points[stage] = state.points[stage].minus(cost);
  state.currentStage = Math.max(state.currentStage, nextStage);
  console.log("[buyNextStage] 成功，currentStage =", state.currentStage);
  return true;
}

// 检查扬声器升级解锁
export function checkSpeakerUpgrades(state) {
  const newly = [];
  for (const u of CONFIG.speakerUpgrades) {
    if (state.speakers >= u.at && !state.speakerUpgrades.has(u.id)) {
      state.speakerUpgrades.add(u.id);
      newly.push(u);
    }
  }
  return newly;
}

// 检查成就解锁
export function checkAchievements(state) {
  const newly = [];
  for (const a of CONFIG.achievements) {
    if (state.unlockedAchievements.has(a.id)) continue;
    try {
      if (a.check(state)) {
        state.unlockedAchievements.add(a.id);
        newly.push(a);
      }
    } catch (e) { /* 忽略未初始化字段 */ }
  }
  return newly;
}

// 检查自动化解锁
export function checkAutomations(state) {
  const newly = [];
  for (const a of CONFIG.automations) {
    if (state.automations.has(a.id)) continue;
    if ((state.resetCounts[a.resetStage] ?? 0) >= a.resetCount && state.speakers >= a.speakers) {
      state.automations.add(a.id);
      newly.push(a);
    }
  }
  return newly;
}

// 某层是否已解锁
export function isStageUnlocked(state, stage) {
  return stage >= 1 && stage <= state.currentStage;
}

// 自动买建筑：所有已解锁层
export function autoBuyAll(state) {
  for (let stage = 1; stage <= state.currentStage; stage++) {
    const buildings = CONFIG.buildings[stage] ?? [];
    let best = null, bestCost = null;
    for (const b of buildings) {
      if (!isUnlocked(state, stage, b)) continue;
      const cost = getBuildingCost(state, stage, b);
      if (state.currencies[stage].lt(cost)) continue;
      if (!bestCost || cost.lt(bestCost)) { best = b; bestCost = cost; }
    }
    if (best) buyBuilding(state, stage, best.id);
  }
}

// 自动买升级：所有已解锁层
export function autoUpgradeAll(state) {
  for (let stage = 1; stage <= state.currentStage; stage++) {
    const upgrades = CONFIG.upgrades[stage] ?? [];
    for (const u of upgrades) {
      if (state.upgrades[stage].has(u.id)) continue;
      if (state.currencies[stage].gte(u.cost)) {
        buyUpgrade(state, stage, u.id);
      }
    }
  }
}

// 自动转化：只对开关打开的层
export function autoConvertAll(state) {
  for (let stage = 1; stage < state.currentStage; stage++) {
    if (!state.autoConvertOn[stage]) continue;
    const target = stage + 1;
    const n = state.convertCounts[target] ?? 0;
    const discount = state.speakerUpgrades.has("sp_convert") ? 0.9 : 1;
    const cost = F.convertCost(n, CONFIG.convertBase, CONFIG.convertGrowth, discount);
    if (state.currencies[stage].gte(cost.times(2))) {
      convert(state, stage);
    }
  }
}

export function buyResetProtection(state, stage, id) {
  const list = CONFIG.resetProtection[stage] ?? [];
  const item = list.find((u) => u.id === id);
  if (!item || state.resetProtection[stage].has(id)) return false;
  if (state.currencies[stage].lt(item.cost)) return false;
  state.currencies[stage] = state.currencies[stage].minus(item.cost);
  state.resetProtection[stage].add(id);
  return true;
}

export function getResetProtectionMultiplier(state, stage) {
  const list = CONFIG.resetProtection[stage] ?? [];
  let sTotal = 0;
  for (const u of list) {
    if (state.resetProtection[stage].has(u.id)) sTotal += u.s;
  }
  return F.resetProtectionMultiplier(sTotal);
}