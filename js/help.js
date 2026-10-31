// 给帮助面板里所有 details 绑定平滑展开/收起
export function bindDetailsAnimation(container) {
  const detailsList = container.querySelectorAll("details.help-section");
  detailsList.forEach((details) => {
    const body = details.querySelector(".help-section-body");
    if (!body) return;

    // 初始状态：关闭的设 max-height 0
    if (!details.open) {
      body.style.maxHeight = "0px";
    } else {
      body.style.maxHeight = body.scrollHeight + "px";
    }

    const summary = details.querySelector("summary");

    summary.addEventListener("click", (e) => {
      e.preventDefault(); // 阻止原生 toggle

      const isOpen = details.open;
      if (isOpen) {
        // 收起
        body.style.maxHeight = body.scrollHeight + "px"; // 先固定当前高度
        requestAnimationFrame(() => {
          body.style.maxHeight = "0px";
        });
        // 动画结束后移除 open
        const onEnd = (ev) => {
          if (ev.propertyName !== "max-height") return;
          body.removeEventListener("transitionend", onEnd);
          details.open = false;
        };
        body.addEventListener("transitionend", onEnd);
      } else {
        // 展开
        details.open = true;
        body.style.maxHeight = "0px";
        requestAnimationFrame(() => {
          body.style.maxHeight = body.scrollHeight + "px";
        });
        // 动画结束后设为 auto（防止内容变化被截断）
        const onEnd = (ev) => {
          if (ev.propertyName !== "max-height") return;
          body.removeEventListener("transitionend", onEnd);
          body.style.maxHeight = "none";
        };
        body.addEventListener("transitionend", onEnd);
      }
    });
  });
}

import { CONFIG } from "./config.js";
import * as F from "./formulas.js";
import * as S from "./systems.js";

const Decimal = window.Decimal;

// 生成一个可折叠区块
function section(title, body, open = false) {
  return `
    <details class="help-section" ${open ? "open" : ""}>
      <summary>${title}</summary>
      <div class="help-section-body">${body}</div>
    </details>
  `;
}

export function buildHelpHTML(state) {
  const parts = [];

  // === 1. 资源说明 ===
  {
    const stageNames = ["算术币", "代数币", "函数币", "微积分币", "抽象币", "超限币"];
    const body = [];
    for (let i = 1; i <= state.currentStage; i++) {
      const stageConf = CONFIG.stages[i - 1];
      body.push(`<p><span class="hl">${stageNames[i - 1]}</span>：${stageConf.name}层主资源，由本层建筑产出，可用于购买本层建筑和知识点升级。</p>`);
      if (i < 6) {
        const target = i + 1;
        const n = state.convertCounts[target] ?? 0;
        const cost = F.convertCost(n, CONFIG.convertBase, CONFIG.convertGrowth);
        body.push(`<p style="margin-left:12px;color:#8a8fa3;">→ 可转化为 ${stageNames[i]}：消耗 ${F.formatNumber(cost)} ${stageNames[i - 1]}，之后每次 ×${CONFIG.convertGrowth}</p>`);
      }
    }
    body.push(`<p><span class="hl">特殊点数</span>（算术星/代数尘/函数核/微积分晶/抽象点）：重置本学段获得，用于购买下一学段入学资格和永久升级。</p>`);
    parts.push(section("资源说明", body.join("")));
  }

  // === 2. 当前学段 ===
  {
    const stage = state.currentStage;
    const stageConf = CONFIG.stages[stage - 1];
    const params = CONFIG.resetParams[stage];
    const body = [];

    body.push(`<p><span class="hl">重置</span>：当前余额 ≥ ${F.formatNumber(params.threshold)} ${stageConf.currency} 时可重置，获得 ${stageConf.points}。</p>`);
    body.push(`<p style="margin-left:12px;color:#8a8fa3;">公式：floor((余额 / ${F.formatNumber(params.threshold)})^${params.exponent} × ${params.coefficient})</p>`);

    if (stage < 6) {
      const nextConf = CONFIG.stages[stage];
      const cost = stageConf.nextStageCost;
      const have = state.points[stage];
      const enough = have.gte(cost);
      body.push(`<p><span class="hl">进入${nextConf.name}</span>：需 <span class="${enough ? 'hl' : 'warn'}">${cost}</span> ${stageConf.points}（当前 ${F.formatNumber(have)}）</p>`);
    } else {
      body.push(`<p class="hl">已到达最终学段。</p>`);
    }
    parts.push(section(`当前学段：${stageConf.name} · ${stageConf.title}`, body.join("")));
  }

  // === 3. 本层建筑 ===
  {
    const stage = state.currentStage;
    const buildings = CONFIG.buildings[stage] ?? [];
    const body = [];
    for (const b of buildings) {
      const count = S.getCount(state, stage, b.id);
      const unlocked = S.isUnlocked(state, stage, b);
      if (unlocked) {
        body.push(`<p><span class="hl">${b.name}</span> ×${count} — 基础产出 ${b.baseOutput}/秒，成本 ×${b.growth}</p>`);
      } else {
        const u = b.unlock;
        const req = CONFIG.buildings[stage].find(x => x.id === u.id);
        body.push(`<p class="lock">🔒 ${b.name} — 需拥有 ${u.count} 个 ${req ? req.name : u.id}</p>`);
      }
    }
    parts.push(section("本层建筑与解锁条件", body.join("")));
  }

  // === 4. 本层知识点升级 ===
  {
    const stage = state.currentStage;
    const stageConf = CONFIG.stages[stage - 1];
    const upgrades = CONFIG.upgrades[stage] ?? [];
    const body = [];
    if (upgrades.length === 0) {
      body.push(`<p class="lock">本层无升级。</p>`);
    } else {
      for (const u of upgrades) {
        const bought = state.upgrades[stage].has(u.id);
        body.push(`<p class="${bought ? 'hl' : ''}">${bought ? '✅' : '🔒'} ${u.name} — ${u.desc}（${F.formatNumber(u.cost)} ${stageConf.currency}）</p>`);
      }
    }
    parts.push(section("本层知识点升级", body.join("")));
  }

  // === 5. 跨层加成 ===
  parts.push(section("跨层加成",
    `<p>下一层货币的数量级会<span class="hl">提升上一层产出</span>。公式：倍率 = 1 + (4.34 × e)^0.9，e 为下层货币 log10 值，封顶 e=10（即下层 1e10 时倍率达到上限 <span class="hl">×30.8</span>）。</p>`
  ));

  // === 6. 永久加成 ===
  parts.push(section("永久加成",
    `<p>每个学段有 12 个"永久加成"升级（价格 1e5 起）。购买后<span class="hl">永久提升本层产出</span>，不随重置消失。</p>` +
    `<p>公式：乘数 = 1 + 1.43 × (1 + s)^0.8，s 为该层已买升级的 s 值总和。满买 12 个（s 总和 42）时本层产出 <span class="hl">×30</span>。</p>`
  ));

  // === 7. 扬声器 ===
  {
    const body = [];
    body.push(`<p>每次重置获得 1 个，跨学段永久保留。</p>`);
    body.push(`<p>当前数量：<span class="hl">${state.speakers}</span></p>`);
    body.push(`<p>效果：</p><ul>`);
    body.push(`<li>自动获取：每秒获得 <span class="hl">当前层产出 × 扬声器数 × 0.1%</span> 的额外货币</li>`);
    body.push(`<li>每 10 个解锁一档升级（见下）</li>`);
    body.push(`<li>全局乘数：+5% × 扬声器数（有递减）</li>`);
    body.push(`</ul>`);
    body.push(`<p class="hl">喇叭升级（已解锁 ${countSpeakerUpgrades(state)}/${CONFIG.speakerUpgrades.length}）</p>`);
    for (const u of CONFIG.speakerUpgrades) {
      const unlocked = state.speakers >= u.at;
      body.push(`<p class="${unlocked ? 'hl' : 'lock'}">${unlocked ? '✅' : '🔒'} ${u.at} 个：${u.name} — ${u.desc}</p>`);
    }
    parts.push(section("课堂喇叭（扬声器）", body.join("")));
  }

  // === 8. 成就 ===
  {
    const s = state.unlockedAchievements.size;
    const body = [];
    body.push(`<p>已解锁：<span class="hl">${s}</span> / ${CONFIG.achievements.length}</p>`);
    body.push(`<p>L1 获取乘数：<span class="hl">×${F.formatNumber(F.achievementMultiplier(s, state.k))}</span>（公式：2^(0.008 × ${s} × ${state.k.toFixed(1)})）</p>`);
    body.push(`<p>成就跨循环累计，重置不清。</p>`);
    parts.push(section("成就", body.join("")));
  }

  // === 9. 自动化 ===
  {
    const body = [];
    body.push(`<p>已解锁 ${state.automations.size}/${CONFIG.automations.length}</p>`);
    for (const a of CONFIG.automations) {
      const unlocked = state.automations.has(a.id);
      const stageName = CONFIG.stages[a.resetStage - 1].name;
      body.push(`<p class="${unlocked ? 'hl' : 'lock'}">${unlocked ? '✅' : '🔒'} ${a.name} — 需 ${stageName}重置 ${a.resetCount} 次 + 扬声器 ${a.speakers} 个</p>`);
    }
    parts.push(section("自动化", body.join("")));
  }

  // === 10. 研究生 k 升级 ===
  if (state.currentStage >= 5) {
    const body = [];
    body.push(`<p>提升成就系数 k（当前 <span class="hl">${state.k.toFixed(1)}</span>），k 越高成就乘数越强。</p>`);
    for (const u of CONFIG.kUpgrades) {
      const bought = state.kUpgrades.has(u.id);
      body.push(`<p class="${bought ? 'hl' : 'lock'}">${bought ? '✅' : '🔒'} ${u.name} — k +${u.kBonus}（${F.formatNumber(u.cost)} 抽象币）</p>`);
    }
    parts.push(section("研究生 k 升级", body.join("")));
  }

  // === 11. 玩法总览 ===
  parts.push(section("玩法总览",
    `<ul>
      <li>点击「写下答案」或等待建筑自动产出，攒本层货币</li>
      <li>用货币购买建筑（提升产出）和知识点升级（×2 乘数）</li>
      <li>攒够门槛后重置本学段，获得特殊点数 + 扬声器</li>
      <li>用特殊点数购买下一学段入学资格</li>
      <li>高学段升级会回头消耗低学段货币，记得维护低层产出</li>
      <li>扬声器越多，自动获取越强，解锁升级越多</li>
      <li>成就跨循环累计，永久提升 L1 产出</li>
    </ul>`
  ));

  return parts.join("");
}

function countSpeakerUpgrades(state) {
  return CONFIG.speakerUpgrades.filter(u => state.speakers >= u.at).length;
}