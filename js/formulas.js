const Decimal = window.Decimal;

// 建筑成本：baseCost × growth^count
export function buildingCost(building, count) {
  return new Decimal(building.baseCost).times(
    new Decimal(building.growth).pow(count)
  );
}

// 建筑产出：baseOutput × count × 该建筑升级乘数 × 全局乘数
export function buildingOutput(building, count, upgradeMult, globalMult) {
  return new Decimal(building.baseOutput).times(count).times(upgradeMult).times(globalMult);
}

// 转化成本：1000 × 1.5^n
export function convertCost(n, convertBase, convertGrowth, discount = 1) {
  return new Decimal(convertBase).times(new Decimal(convertGrowth).pow(n)).times(discount);
}

// 重置点数：floor( (累计/门槛)^0.4 × 系数 )
export function resetPoints(total, threshold, coefficient, exponent = 0.4) {
  return total.dividedBy(threshold).pow(exponent).times(coefficient).floor();
}

// 成就乘数：2^(0.003 × s × k)
export function achievementMultiplier(s, k) {
  return new Decimal(2).pow(0.008 * s * k);
}

// 扬声器自动获取：产出 × 扬声器数 × 0.001 × 递减修正
export function speakerAutoGain(output, speakers, extraMult = 1) {
  const decay = new Decimal(1).dividedBy(1 + speakers * 0.01);
  return output.times(speakers).times(0.001).times(decay).times(extraMult);
}

// 扬声器全局乘数：1 + 0.05 × 扬声器数（递减）
export function speakerGlobalMult(speakers) {
  const decay = new Decimal(1).dividedBy(1 + speakers * 0.005);
  return new Decimal(1).plus(new Decimal(0.05).times(speakers).times(decay));
}

// 全局乘数（重置次数 + 扬声器）
export function globalMultiplier(resetCounts, speakers) {
  let totalResets = 0;
  for (const k of Object.keys(resetCounts)) totalResets += resetCounts[k];
  return new Decimal(1)
    .plus(new Decimal(0.01).times(totalResets))
    .plus(new Decimal(0.05).times(speakers));
}

// 格式化大数（1.23e45 这种）
export function formatNumber(d) {
  if (!(d instanceof Decimal)) d = new Decimal(d);
  if (d.lt(1000)) return d.toFixed(2).replace(/\.00$/, "");
  if (d.lt(1e6)) return d.toFixed(0);
  // 科学计数
  return d.toExponential(2).replace("e+", "e");
}

// 永久加成乘数：1 + k × (1 + s)^0.8
const RP_K = 1.43;

export function resetProtectionMultiplier(sTotal) {
  if (sTotal <= 0) return new Decimal(1);
  return new Decimal(1).plus(new Decimal(RP_K).times(Math.pow(1 + sTotal, 0.8)));
}

// 下层货币 e 值 → 上层货币产出倍率
// e = 下层货币的 log10 值，封顶 10
export function crossLayerMultiplier(nextCurrencyDecimal) {
  if (!nextCurrencyDecimal || nextCurrencyDecimal.lte(1)) return new Decimal(1);
  // 取 log10，封顶 10
  let e = nextCurrencyDecimal.log10();
  if (e > 10) e = 10;
  if (e <= 0) return new Decimal(1);
  const k = 4.34 * e;
  return new Decimal(1).plus(Math.pow(k, 0.9));
}