// lib/admin.js
// App-side admin users (testers who see debug overlays such as the TALK
// latency timer). Render env, no deploy needed: ADMIN_NICKS=Maria,Rick
// (comma-separated Nicks, case-insensitive). Unrelated to the admin
// dashboard login (lib/dashboard-auth.js).

export function isAdminNick(username) {
  const nick = String(username || "").trim().toLowerCase();
  if (!nick) return false;
  return String(process.env.ADMIN_NICKS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(nick);
}
