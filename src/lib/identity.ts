/**
 * Client-side identity (GAME.md → Disconnection and reconnection).
 * The detective badge is the stable player id per room; the host key
 * proves room ownership. Both live in localStorage so a reload or
 * network drop reconnects to the same seat. Client components only.
 */

function randomToken(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 20);
}

export function getOrCreateBadge(room: string): string {
  const key = `cd:badge:${room}`;
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const badge = randomToken();
  localStorage.setItem(key, badge);
  return badge;
}

export function getOrCreateHostKey(room: string): string {
  const key = `cd:hostkey:${room}`;
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const hostKey = randomToken();
  localStorage.setItem(key, hostKey);
  return hostKey;
}

export function rememberName(name: string): void {
  localStorage.setItem("cd:name", name);
}

export function recallName(): string {
  return localStorage.getItem("cd:name") ?? "";
}

export function randomRoomCode(): string {
  return String(10000 + Math.floor(Math.random() * 90000));
}

export function isValidRoomCode(code: string): boolean {
  return /^\d{5}$/.test(code);
}
