import * as crypto from "node:crypto";

export const COOKIE_NAME = "brenda_session";
const AUTH_SESSION_SECRET = process.env.AUTH_SESSION_SECRET || "default_secret";

export function signSession(payload, expires = 86400 * 7) {
  const head = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const p = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + expires })).toString("base64url");
  const sig = crypto.createHmac("sha256", AUTH_SESSION_SECRET).update(`${head}.${p}`).digest("base64url");
  return `${head}.${p}.${sig}`;
}

export function verifySession(token) {
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [head, p, sig] = parts;
    const expected = crypto.createHmac("sha256", AUTH_SESSION_SECRET).update(`${head}.${p}`).digest("base64url");
    if (sig !== expected) return null;
    return JSON.parse(Buffer.from(p, "base64url").toString());
  } catch (e) {
    return null;
  }
}

export function getSession(req) {
  const rawCookies = req.headers.cookie || "";
  // Handle both "; " (standard) and ";" (potential edge case) or just splitting by name
  const cookieDiff = rawCookies.split(';').map(c => c.trim()).find(row => row.startsWith(COOKIE_NAME + '='));
  if (!cookieDiff) return null;

  const token = decodeURIComponent(cookieDiff.split('=')[1]);
  return verifySession(token);
}

export function requireSession(req, res) {
  const s = getSession(req);
  if (!s?.userId) {
    res.statusCode = 401;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Not signed in" }));
    return null;
  }
  return s;
}

export function setSessionCookie(res, payload) {
  const token = signSession(payload);
  const secure = process.env.VERCEL ? "Secure; " : "";
  const maxAge = 60 * 60 * 24 * 30; // 30 days
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; ${secure}Max-Age=${maxAge}`
  );
}

export function clearSessionCookie(res) {
  const secure = process.env.VERCEL ? "Secure; " : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; ${secure}Max-Age=0`
  );
}
