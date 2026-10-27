let counter = 0;

/**
 * Creates a stable, unique identifier. IDs are never reused or re-derived,
 * so references survive save/load and undo/redo.
 */
export function createId(prefix: string): string {
  counter = (counter + 1) % 0xffffff;
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
      : Math.random().toString(16).slice(2, 12);
  return `${prefix}_${rand}${counter.toString(16)}`;
}

/** FNV-1a 32-bit hash, used for deterministic derived keys. */
export function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
