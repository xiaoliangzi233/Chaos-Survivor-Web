import { getPlayerCodex, recordPlayerCodexEntry } from "./playerProgress.js";
import { state } from "../state.js";

const VALID_TYPES = new Set(["enemies", "weapons", "items", "events"]);

export function recordCodexEntry(type, id) {
  if (state.debug?.enabled || state.debug?.runTainted) return false;
  return VALID_TYPES.has(type) ? recordPlayerCodexEntry(type, id) : false;
}

export function getCodexEntries(type) {
  if (!VALID_TYPES.has(type)) return [];
  return getPlayerCodex()[type] || [];
}

export function isCodexUnlocked(type, id) {
  return getCodexEntries(type).includes(id);
}
