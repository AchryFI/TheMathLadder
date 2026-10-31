const Decimal = window.Decimal;

// 创建初始状态
export function createInitialState() {
  const state = {
    // 货币（L1~L6）
    currencies: {
      1: new Decimal(0),
      2: new Decimal(0),
      3: new Decimal(0),
      4: new Decimal(0),
      5: new Decimal(0),
      6: new Decimal(0),
    },
    // 累计获取（用于成就判断）
    totals: {
      1: new Decimal(0),
      2: new Decimal(0),
      3: new Decimal(0),
      4: new Decimal(0),
      5: new Decimal(0),
      6: new Decimal(0),
    },
    // 跨循环累计（成就专用，重置不清）
    lifetimeTotals: {
      1: new Decimal(0),
      2: new Decimal(0),
      3: new Decimal(0),
      4: new Decimal(0),
      5: new Decimal(0),
      6: new Decimal(0),
    },
    // 建筑数量：buildings[stage][buildingId] = count
    buildings: {
      1: {}, 2: {}, 3: {}, 4: {}, 5: {}, 6: {},
    },
    // 已购买升级：upgrades[stage] = Set of upgradeId
    upgrades: {
      1: new Set(), 2: new Set(), 3: new Set(), 4: new Set(), 5: new Set(), 6: new Set(),
    },
    // 已购买 k 升级
    kUpgrades: new Set(),
    // 已购买的重置保护（每学段 Set）
    resetProtection: {
      1: new Set(), 2: new Set(), 3: new Set(),
      4: new Set(), 5: new Set(), 6: new Set(),
    },
    // 当前 k 值（基础 1 + 加成）
    k: 1,
    // 扬声器
    speakers: 0,
    // 已解锁的扬声器升级
    speakerUpgrades: new Set(),
    // 成就
    unlockedAchievements: new Set(),
    // 重置次数（每学段）
    resetCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
    // 当前查看/操作的层
    viewStage: 1,
    // 自动转化开关（每层独立）
    autoConvertOn: { 1: false, 2: false, 3: false, 4: false, 5: false, 6: false },
    // 刷新间隔（毫秒）
    tickRate: 100,
    convertCounts: { 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
    // 特殊点数（每学段重置获得，用于买下一学段入学）
    points: {
      1: new Decimal(0), 2: new Decimal(0), 3: new Decimal(0),
      4: new Decimal(0), 5: new Decimal(0), 6: new Decimal(0),
    },
    // 当前最高已解锁学段（1~6）
    currentStage: 1,
    // 已解锁的自动化解锁 id
    automations: new Set(),
    // 统计
    totalClicks: 0,
    // 最后一次保存时间戳
    lastSave: Date.now(),
    // 剧情进度（已触发的剧情 id）
    storySeen: new Set(),
  };
  return state;
}

// 序列化（Decimal -> string，Set -> Array）
export function serialize(state) {
  const out = {
    lifetimeTotals: {},
    currencies: {},
    totals: {},
    buildings: state.buildings,
    upgrades: {},
    kUpgrades: [...state.kUpgrades],
    k: state.k,
    speakers: state.speakers,
    speakerUpgrades: [...state.speakerUpgrades],
    unlockedAchievements: [...state.unlockedAchievements],
    resetCounts: state.resetCounts,
    viewStage: state.viewStage,
    autoConvertOn: state.autoConvertOn,
    points: {},
    currentStage: state.currentStage,
    automations: [...state.automations],
    totalClicks: state.totalClicks,
    lastSave: Date.now(),
    storySeen: [...state.storySeen],
    convertCounts: state.convertCounts,
    tickRate: state.tickRate,
    resetProtection: {
      1: [...state.resetProtection[1]],
      2: [...state.resetProtection[2]],
      3: [...state.resetProtection[3]],
      4: [...state.resetProtection[4]],
      5: [...state.resetProtection[5]],
      6: [...state.resetProtection[6]],
    },
  };
  for (const k of Object.keys(state.currencies)) {
    out.currencies[k] = state.currencies[k].toString();
    out.totals[k] = state.totals[k].toString();
    out.points[k] = state.points[k].toString();
  }
  for (const s of Object.keys(state.upgrades)) {
    out.upgrades[s] = [...state.upgrades[s]];
  }
  return out;
}

// 反序列化
export function deserialize(data) {
  const state = createInitialState();
  for (const k of Object.keys(data.currencies)) {
    state.currencies[k] = new Decimal(data.currencies[k]);
    state.totals[k] = new Decimal(data.totals[k]);
    state.points[k] = new Decimal(data.points[k]);
  }
  state.buildings = data.buildings;
  for (const s of Object.keys(data.upgrades)) {
    state.upgrades[s] = new Set(data.upgrades[s]);
  }
  state.kUpgrades = new Set(data.kUpgrades);
  state.tickRate = data.tickRate ?? 100;
  state.k = data.k;
  state.speakers = data.speakers;
  state.speakerUpgrades = new Set(data.speakerUpgrades);
  state.unlockedAchievements = new Set(data.unlockedAchievements);
  state.resetCounts = data.resetCounts;
  state.viewStage = data.viewStage ?? 1;
  state.autoConvertOn = data.autoConvertOn ?? { 1: false, 2: false, 3: false, 4: false, 5: false, 6: false };
  state.currentStage = data.currentStage;
  state.automations = new Set(data.automations);
  state.totalClicks = data.totalClicks;
  state.lastSave = data.lastSave;
  state.storySeen = new Set(data.storySeen);
  state.convertCounts = data.convertCounts ?? { 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  state.resetProtection = {
    1: new Set(data.resetProtection?.[1] ?? []),
    2: new Set(data.resetProtection?.[2] ?? []),
    3: new Set(data.resetProtection?.[3] ?? []),
    4: new Set(data.resetProtection?.[4] ?? []),
    5: new Set(data.resetProtection?.[5] ?? []),
    6: new Set(data.resetProtection?.[6] ?? []),
  };
  return state;
}