import { serialize, deserialize, createInitialState } from "./state.js";
import { CONFIG } from "./config.js";

const SAVE_KEY = "math_ladder_save_v1";

// ===== 基础存档 =====
let savingDisabled = false;

export function disableAutoSave() {
  savingDisabled = true;
}

export function saveGame(state) {
  if (savingDisabled) return false;
  try {
    const data = serialize(state);
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.error("存档失败", e);
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return deserialize(data);
  } catch (e) {
    console.error("读档失败", e);
    return null;
  }
}

export function clearSave() {
  localStorage.removeItem(SAVE_KEY);
}

export function getOrCreateState() {
  const loaded = loadGame();
  return loaded ?? createInitialState();
}

// ===== 哈希（FNV-1a，简单足够防手改） =====
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function hashPayload(payload) {
  // 对字段做确定性序列化后哈希
  const stable = JSON.stringify(payload, Object.keys(payload).sort());
  return fnv1a(stable);
}

// ===== 导出 =====
export function exportSave(state) {
  const data = serialize(state);
  data.exportTime = Date.now();

  // 生成哈希（不含 hash 字段本身）
  const payload = { ...data };
  delete payload.hash;
  const hash = hashPayload(payload);
  payload.hash = hash;

  const json = JSON.stringify(payload);
  // UTF-8 安全的 base64
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return { b64, exportTime: data.exportTime, currentStage: state.currentStage };
}

// ===== 导入（返回解析结果或错误） =====
export function parseImport(b64) {
  try {
    const json = decodeURIComponent(escape(atob(b64.trim())));
    const data = JSON.parse(json);

    // 校验哈希
    const payload = { ...data };
    delete payload.hash;
    const expected = hashPayload(payload);
    if (data.hash !== expected) {
      return { ok: false, reason: "哈希校验失败：存档可能被修改" };
    }

    // 字段完整性
    if (!data.currencies || !data.currentStage) {
      return { ok: false, reason: "存档格式不完整" };
    }

    return {
      ok: true,
      raw: data,
      exportTime: data.exportTime ?? null,
      currentStage: data.currentStage,
      state: deserialize(data),
    };
  } catch (e) {
    return { ok: false, reason: "解析失败：" + e.message };
  }
}

// ===== 应用导入 =====
export function applyImport(raw) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(raw));
    return true;
  } catch (e) {
    return false;
  }
}