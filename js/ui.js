import { CONFIG } from "./config.js";
import * as F from "./formulas.js";
import * as S from "./systems.js";
import { STORY } from "./story.js";
const Decimal = window.Decimal;

// 日志
export function log(state, msg, type = "") {
  const el = document.getElementById("log");
  const line = document.createElement("div");
  line.className = "line " + type;
  line.textContent = msg;
  el.appendChild(line);
  while (el.children.length > 50) el.removeChild(el.firstChild);
  el.scrollTop = el.scrollHeight;
}

// 更新顶部货币栏
export function updateTopbar(state) {
  for (let i = 1; i <= 6; i++) {
    const valEl = document.getElementById(`val-l${i}`);
    const rateEl = document.getElementById(`rate-l${i}`);
    const curEl = document.getElementById(`cur-l${i}`);
    if (!valEl || !curEl) continue;
    if (i > state.currentStage) {
      curEl.style.display = "none";
      continue;
    }
    curEl.style.display = "flex";
    curEl.classList.toggle("viewing", i === state.viewStage);
    valEl.textContent = F.formatNumber(state.currencies[i]);
    if (rateEl) {
      const rate = S.getStageOutput(state, i);
      let text = `+${F.formatNumber(rate)}/s`;
      // 显示下层加成
      if (i < 6) {
        const mult = F.crossLayerMultiplier(state.currencies[i + 1]);
        if (mult.gt(1.01)) {
          text += `　下层×${F.formatNumber(mult)}`;
        }
      }
      rateEl.textContent = text;
    }
  }
}

export function updateStageTabs(state) {
  const container = document.getElementById("stage-tabs");
  if (!container) return;
  container.innerHTML = "";
  for (let i = 1; i <= 6; i++) {
    const unlocked = i <= state.currentStage;
    const active = i === state.viewStage;
    const div = document.createElement("div");
    div.className = "stage-tab" + (active ? " active" : "") + (unlocked ? "" : " locked");
    div.textContent = CONFIG.stages[i - 1].name;
    if (unlocked) {
      div.onclick = () => {
        state.viewStage = i;
        updateAll(state);
      };
    }
    container.appendChild(div);
  }
}

export function updateBuildings(state) {
  const stage = state.viewStage;
  const container = document.getElementById("buildings");
  const buildings = CONFIG.buildings[stage] ?? [];

  const currentKey = container.dataset.stage;
  if (currentKey !== String(stage)) {
    container.dataset.stage = String(stage);
    container.innerHTML = "";
    for (const b of buildings) {
      const div = document.createElement("div");
      div.className = "building";
      div.dataset.id = b.id;
      div.innerHTML = `<span class="name"></span><span class="cost"></span>`;
      div.addEventListener("mousedown", (e) => e.preventDefault());
      div.addEventListener("click", () => {
        if (!S.isUnlocked(state, stage, b)) return;
        if (S.buyBuilding(state, stage, b.id)) {
          updateAll(state);
        }
      });
      container.appendChild(div);
    }
  }

  for (const b of buildings) {
    const div = container.querySelector(`[data-id="${b.id}"]`);
    if (!div) continue;
    const unlocked = S.isUnlocked(state, stage, b);
    const count = S.getCount(state, stage, b.id);
    const cost = S.getBuildingCost(state, stage, b);
    const canAfford = state.currencies[stage].gte(cost);
    div.classList.toggle("locked", !unlocked);
    div.querySelector(".name").textContent = `${b.name} ×${count}`;
    div.querySelector(".cost").textContent = unlocked ? F.formatNumber(cost) : "🔒";
    div.style.opacity = unlocked ? (canAfford ? "1" : "0.7") : "0.4";
  }

  document.getElementById("stage-title").textContent = CONFIG.stages[stage - 1].title;
}

// 更新升级列表（只构建一次，之后只更新状态）
export function updateUpgrades(state) {
  const stage = state.viewStage;
  const container = document.getElementById("upgrades");
  const upgrades = CONFIG.upgrades[stage] ?? [];

  const currentKey = container.dataset.stage;
  if (currentKey !== String(stage)) {
    container.dataset.stage = String(stage);
    container.innerHTML = "";
    for (const u of upgrades) {
      const div = document.createElement("div");
      div.className = "upgrade";
      div.dataset.id = u.id;
      div.innerHTML = `<div class="name">${u.name}</div><div class="desc">${u.desc}</div><div class="cost" data-cost></div>`;
      div.addEventListener("mousedown", (e) => e.preventDefault());
      div.addEventListener("click", () => {
        if (state.upgrades[stage].has(u.id)) return;
        if (S.buyUpgrade(state, stage, u.id)) updateAll(state);
      });
      container.appendChild(div);
    }
  }

  for (const u of upgrades) {
    const div = container.querySelector(`[data-id="${u.id}"]`);
    if (div) refreshUpgradeCard(div, state, stage, u);
  }
}

function refreshUpgradeCard(div, state, stage, u) {
  const bought = state.upgrades[stage].has(u.id);
  const canAfford = state.currencies[stage].gte(u.cost);
  const costEl = div.querySelector("[data-cost]");
  div.classList.toggle("bought", bought);
  div.classList.toggle("affordable", !bought && canAfford);
  div.classList.toggle("unaffordable", !bought && !canAfford);
  costEl.textContent = bought ? "已购买" : F.formatNumber(u.cost);
}

export function updateReset(state) {
  const stage = state.viewStage;
  const params = CONFIG.resetParams[stage];
  const gain = S.getResetGain(state, stage);
  const info = document.getElementById("reset-info");
  const btn = document.getElementById("reset-btn");

  const enough = state.currencies[stage].gte(params.threshold);
  if (enough) {
    info.textContent = `可获得：${F.formatNumber(gain)} ${CONFIG.stages[stage - 1].points}`;
  } else {
    info.textContent = `需累计 ${F.formatNumber(params.threshold)} ${CONFIG.stages[stage - 1].currency} 才能重置（当前 ${F.formatNumber(state.currencies[stage])}）`;
  }
  btn.disabled = !enough;

  btn.onclick = () => {
    const r = S.doReset(state, stage);
    if (r.ok) {
      state.storySeen.add(`reset_${stage}`);
      log(state, STORY.resetLines[stage] ?? "重置完成。", "story");
      log(state, `获得 ${F.formatNumber(r.gain)} ${CONFIG.stages[stage - 1].points}`, "good");
      updateAll(state);
    } else {
      log(state, `无法重置：${r.reason}`, "bad");
    }
  };

  // 入学按钮
  let btnEl = document.getElementById("enter-next-btn");
  if (!btnEl) {
    btnEl = document.createElement("button");
    btnEl.id = "enter-next-btn";
    btnEl.style.cssText = "width:100%;padding:8px;margin-top:8px;background:#4f46e5;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600;";
    btnEl.onclick = () => {
      const st = state.currentStage;
      if (st >= 6) return;
      if (S.buyNextStage(state, st)) {
        state.storySeen.add(`enter${st + 1}`);
        state.viewStage = state.currentStage;
        log(state, STORY.enterLines[st + 1] ?? "进入新学段。", "story");
        updateAll(state);
      } else {
        log(state, "点数不足，无法进入下一学段。", "bad");
      }
    };
    document.getElementById("reset-area").appendChild(btnEl);
  }

  if (stage < 6 && stage === state.currentStage) {
    const cost = CONFIG.stages[stage - 1].nextStageCost;
    const show = state.points[stage].gte(cost);
    btnEl.style.display = show ? "block" : "none";
    if (show) btnEl.textContent = `进入${CONFIG.stages[stage].name}（消耗 ${cost} ${CONFIG.stages[stage - 1].points}）`;
  } else {
    btnEl.style.display = "none";
  }
}
// 更新扬声器区
export function updateSpeakers(state) {
  document.getElementById("speaker-count").textContent = state.speakers;
  const autoGain = F.speakerAutoGain(
    S.getStageOutput(state, state.currentStage),
    state.speakers,
    state.speakerUpgrades.has("sp_auto2") ? 2 : 1
  );
  document.getElementById("speaker-auto").textContent = F.formatNumber(autoGain);

  const container = document.getElementById("speaker-upgrades");
  container.innerHTML = "";
  for (const u of CONFIG.speakerUpgrades) {
    const unlocked = state.speakers >= u.at;
    const div = document.createElement("div");
    div.className = "achievement " + (unlocked ? "unlocked" : "locked");
    div.textContent = `${u.at} 🔊 ${u.name} — ${u.desc}`;
    container.appendChild(div);
  }
}

// 更新成就区
export function updateAchievements(state) {
  const s = state.unlockedAchievements.size;
  document.getElementById("ach-count").textContent = s;
  const mult = F.achievementMultiplier(s, state.k);
  document.getElementById("ach-mult").textContent = F.formatNumber(mult);

  const container = document.getElementById("achievements");
  container.innerHTML = "";
  for (const a of CONFIG.achievements) {
    const unlocked = state.unlockedAchievements.has(a.id);
    const div = document.createElement("div");
    div.className = "achievement " + (unlocked ? "unlocked" : "locked");
    div.textContent = `${unlocked ? "✅" : "🔒"} ${a.name} — ${a.desc}`;
    container.appendChild(div);
  }
}

export function updateAll(state) {
  updateStageTabs(state);
  updateTopbar(state);
  updateBuildings(state);
  updateUpgrades(state);
  updateKUpgrades(state);
  updateResetProtection(state);   // ← 新增
  updateConvert(state);
  updateReset(state);
  updateSpeakers(state);
  updateAchievements(state);
}

import { buildHelpHTML, bindDetailsAnimation } from "./help.js";

export function initHelp(state) {
  const btn = document.getElementById("help-btn");
  const overlay = document.getElementById("help-overlay");
  const close = document.getElementById("help-close");
  const content = document.getElementById("help-content");

  btn.onclick = () => {
    content.innerHTML = buildHelpHTML(state);
    overlay.classList.remove("hidden");
    // 绑定折叠动画
    bindDetailsAnimation(content);
  };
  close.onclick = () => overlay.classList.add("hidden");
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.classList.add("hidden");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.classList.contains("hidden")) {
      overlay.classList.add("hidden");
    }
  });
}
export function updateConvert(state) {
  const stage = state.viewStage;
  const info = document.getElementById("convert-info");
  const btn = document.getElementById("convert-btn");
  const toggle = document.getElementById("auto-convert-toggle");
  if (!info || !btn) return;

  if (stage >= 6) {
    info.textContent = "已是最高层，无需转化。";
    btn.style.display = "none";
    if (toggle) toggle.style.display = "none";
    return;
  }

  const canConvert = stage < state.currentStage;
  btn.style.display = canConvert ? "block" : "none";
  if (toggle) toggle.style.display = canConvert ? "flex" : "none";

  if (!canConvert) {
    info.textContent = "需先解锁下一学段才能转化。";
    return;
  }

  const target = stage + 1;
  const n = state.convertCounts[target] ?? 0;
  const discount = state.speakerUpgrades.has("sp_convert") ? 0.9 : 1;
  const cost = F.convertCost(n, CONFIG.convertBase, CONFIG.convertGrowth, discount);
  const curName = CONFIG.stages[stage - 1].currency;
  const nextName = CONFIG.stages[stage].currency;

  info.textContent = `消耗 ${F.formatNumber(cost)} ${curName} → 1 ${nextName}（已转化 ${n} 次）`;
  btn.textContent = `转化 1 ${nextName}`;
  btn.disabled = state.currencies[stage].lt(cost);

  btn.onclick = () => {
    if (S.convert(state, stage)) updateAll(state);
  };

  if (toggle) {
    const cb = toggle.querySelector("input");
    cb.checked = state.autoConvertOn[stage];
    cb.onchange = () => { state.autoConvertOn[stage] = cb.checked; };
  }
}

export function initSettings(state, onTickRateChange) {
  const btn = document.getElementById("settings-btn");
  const overlay = document.getElementById("settings-overlay");
  const close = document.getElementById("settings-close");
  const slider = document.getElementById("tick-rate-slider");
  const valueEl = document.getElementById("tick-rate-value");

  btn.onclick = () => {
    slider.value = String(state.tickRate);
    valueEl.textContent = state.tickRate;
    overlay.classList.remove("hidden");
  };
  close.onclick = () => overlay.classList.add("hidden");
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.classList.add("hidden");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") overlay.classList.add("hidden");
  });

  slider.oninput = () => {
    valueEl.textContent = slider.value;
  };
  slider.onchange = () => {
    state.tickRate = parseInt(slider.value, 10);
    valueEl.textContent = state.tickRate;
    if (onTickRateChange) onTickRateChange(state.tickRate);
  };
  // 存档管理 UI 初始化（只初始化一次）
  if (!overlay.dataset.saveInit) {
    overlay.dataset.saveInit = "1";
    initSaveUI(state, () => location.reload());
  }
}

export function updateKUpgrades(state) {
  const area = document.getElementById("k-upgrades-area");
  const container = document.getElementById("k-upgrades");
  const kValueEl = document.getElementById("k-value");
  if (!area || !container) return;

  // 只在研究生层显示
  if (state.viewStage !== 5) {
    area.style.display = "none";
    return;
  }
  area.style.display = "block";
  kValueEl.textContent = state.k.toFixed(1);

  // 首次构建
  if (container.dataset.built !== "1") {
    container.dataset.built = "1";
    container.innerHTML = "";
    for (const u of CONFIG.kUpgrades) {
      const div = document.createElement("div");
      div.className = "upgrade";
      div.dataset.id = u.id;
      div.innerHTML = `
        <div class="name">${u.name}</div>
        <div class="desc">k +${u.kBonus}</div>
        <div class="cost" data-cost></div>
      `;
      div.addEventListener("mousedown", (e) => e.preventDefault());
      div.addEventListener("click", () => {
        if (state.kUpgrades.has(u.id)) return;
        if (S.buyKUpgrade(state, u.id)) {
          updateAll(state);
        }
      });
      container.appendChild(div);
    }
  }

  // 更新状态
  for (const u of CONFIG.kUpgrades) {
    const div = container.querySelector(`[data-id="${u.id}"]`);
    if (!div) continue;
    const bought = state.kUpgrades.has(u.id);
    const canAfford = state.currencies[5].gte(u.cost);
    const costEl = div.querySelector("[data-cost]");
    div.classList.toggle("bought", bought);
    div.classList.toggle("affordable", !bought && canAfford);
    div.classList.toggle("unaffordable", !bought && !canAfford);
    costEl.textContent = bought ? "已购买" : F.formatNumber(u.cost) + " 抽象币";
  }
}
export function updateResetProtection(state) {
  const stage = state.viewStage;
  const area = document.getElementById("reset-protection-area");
  const container = document.getElementById("reset-protection-list");
  if (!area || !container) return;

  const list = CONFIG.resetProtection[stage] ?? [];
  if (list.length === 0) {
    area.style.display = "none";
    return;
  }
  area.style.display = "block";

  const key = `rp_${stage}`;
  if (container.dataset.built !== key) {
    container.dataset.built = key;
    container.innerHTML = "";
    for (const u of list) {
      const div = document.createElement("div");
      div.className = "upgrade";
      div.dataset.id = u.id;
div.innerHTML = `
  <div class="name">${u.name}</div>
  <div class="desc">s +${u.s}（累计 s 越高，乘数越强）</div>
  <div class="cost" data-cost></div>
`;
      div.addEventListener("mousedown", (e) => e.preventDefault());
      div.addEventListener("click", () => {
        if (state.resetProtection[stage].has(u.id)) return;
        if (S.buyResetProtection(state, stage, u.id)) {
          updateAll(state);
        }
      });
      container.appendChild(div);
    }
  }

  for (const u of list) {
    const div = container.querySelector(`[data-id="${u.id}"]`);
    if (!div) continue;
    const bought = state.resetProtection[stage].has(u.id);
    const canAfford = state.currencies[stage].gte(u.cost);
    const costEl = div.querySelector("[data-cost]");
    div.classList.toggle("bought", bought);
    div.classList.toggle("affordable", !bought && canAfford);
    div.classList.toggle("unaffordable", !bought && !canAfford);
    costEl.textContent = bought ? "已购买" : F.formatNumber(u.cost);
  };
  let sTotal = 0;
for (const u of list) {
  if (state.resetProtection[stage].has(u.id)) sTotal += u.s;
}
const mult = F.resetProtectionMultiplier(sTotal);
const sEl = document.getElementById("rp-s-total");
const mEl = document.getElementById("rp-mult");
if (sEl) sEl.textContent = sTotal;
if (mEl) mEl.textContent = "×" + F.formatNumber(mult);
}

import * as Save from "./save.js";

export function initSaveUI(state, onReload) {
  const exportBtn = document.getElementById("export-btn");
  const importBtn = document.getElementById("import-btn");
  const clearBtn = document.getElementById("clear-save-btn");
  const exportArea = document.getElementById("export-textarea");
  const exportInfo = document.getElementById("export-info");
  const importArea = document.getElementById("import-textarea");
  const importPreview = document.getElementById("import-preview");
  const importConfirm = document.getElementById("import-confirm-btn");

  let pendingImport = null;

  // 导出
  exportBtn.onclick = () => {
    const { b64, exportTime, currentStage } = Save.exportSave(state);
    exportArea.value = b64;
    exportArea.select();
    const stageName = CONFIG.stages[currentStage - 1].name;
    exportInfo.textContent = `导出时间：${new Date(exportTime).toLocaleString()}　层级：${stageName}`;
    // 尝试复制
    try {
      document.execCommand("copy");
      exportInfo.textContent += "（已复制到剪贴板）";
    } catch (e) {}
  };

  // 导入：先预览
  importBtn.onclick = () => {
    const b64 = importArea.value.trim();
    if (!b64) {
      importPreview.textContent = "请先粘贴存档码";
      importPreview.className = "setting-hint err";
      importConfirm.style.display = "none";
      return;
    }
    const result = Save.parseImport(b64);
    if (!result.ok) {
      importPreview.textContent = "❌ " + result.reason;
      importPreview.className = "setting-hint err";
      importConfirm.style.display = "none";
      pendingImport = null;
      return;
    }
    pendingImport = result;
    const time = result.exportTime ? new Date(result.exportTime).toLocaleString() : "未知";
    const stageName = CONFIG.stages[result.currentStage - 1].name;
    importPreview.textContent = `✅ 校验通过　导出时间：${time}　层级：${stageName}`;
    importPreview.className = "setting-hint ok";
    importConfirm.style.display = "inline-block";
  };

  // 确认导入
  importConfirm.onclick = () => {
    if (!pendingImport) return;
    if (!confirm("确定导入此存档？当前进度将被覆盖。")) return;
    if (Save.applyImport(pendingImport.raw)) {
      alert("导入成功，即将刷新页面。");
      if (onReload) onReload();
      else location.reload();
    } else {
      alert("导入失败：写入本地存储出错");
    }
  };

  // 重置存档
  clearBtn.onclick = () => {
    if (!confirm("确定重置存档？所有进度将丢失，无法恢复。")) return;
    if (!confirm("再次确认：真的要删除所有进度吗？")) return;
    Save.disableAutoSave();   // ← 禁用自动保存
    Save.clearSave();
    alert("存档已删除，即将刷新页面。");
    location.reload();
  };
}

export function initStory(state) {
  const btn = document.getElementById("story-btn");
  const overlay = document.getElementById("story-overlay");
  const close = document.getElementById("story-close");
  const content = document.getElementById("story-content");

  btn.onclick = () => {
    content.innerHTML = buildStoryHTML(state);
    overlay.classList.remove("hidden");
    // 绑定折叠动画（复用帮助的）
    import("./help.js").then(m => m.bindDetailsAnimation(content));
  };
  close.onclick = () => overlay.classList.add("hidden");
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.classList.add("hidden");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.classList.contains("hidden")) {
      overlay.classList.add("hidden");
    }
  });
}

// 生成剧情 HTML（按已解锁过滤）
function buildStoryHTML(state) {
  const parts = [];
  const seen = state.storySeen ?? new Set();

  for (const arc of STORY.archive) {
    // 未解锁的不显示（或者显示为锁定）
    const unlocked = seen.has(arc.id);
    if (!unlocked) continue;

    const body = arc.lines.map(line => `<p style="color:#a5b4fc;font-style:italic;">${line}</p>`).join("");
    parts.push(`
      <details class="help-section">
        <summary>${arc.title}</summary>
        <div class="help-section-body">${body}</div>
      </details>
    `);
  }

  if (parts.length === 0) {
    parts.push(`<p style="color:#8a8fa3;">尚未解锁任何剧情。继续游戏以解锁。</p>`);
  }

  return parts.join("");
}