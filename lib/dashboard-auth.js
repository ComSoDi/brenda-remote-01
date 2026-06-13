import * as crypto from "node:crypto";

const COOKIE_NAME  = "dashboard_session";
const SESSION_SECRET = process.env.AUTH_SESSION_SECRET || "default_secret";

function _sign(payload, expires = 28800) {
  const head = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const p    = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + expires })).toString("base64url");
  const sig  = crypto.createHmac("sha256", SESSION_SECRET).update(`${head}.${p}`).digest("base64url");
  return `${head}.${p}.${sig}`;
}

function _verify(token) {
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [head, p, sig] = parts;
    const expected = crypto.createHmac("sha256", SESSION_SECRET).update(`${head}.${p}`).digest("base64url");
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(p, "base64url").toString());
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function _parseCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  const entry = cookieHeader.split(";").map(c => c.trim()).find(c => c.startsWith(name + "="));
  if (!entry) return null;
  return decodeURIComponent(entry.slice(name.length + 1));
}

export function getDashboardSession(req) {
  const token = _parseCookie(req.headers.cookie || "", COOKIE_NAME);
  return _verify(token);
}

export function requireDashboardSession(req, res) {
  const s = getDashboardSession(req);
  if (!s?.email) {
    res.statusCode = 401;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Not authenticated" }));
    return null;
  }
  return s;
}

export function setDashboardCookie(res, payload) {
  const token  = _sign(payload);
  const secure = process.env.VERCEL ? "Secure; " : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; ${secure}Max-Age=28800`,
  );
}

export function clearDashboardCookie(res) {
  const secure = process.env.VERCEL ? "Secure; " : "";
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; ${secure}Max-Age=0`);
}

export function parseCookieValue(cookieHeader, name) {
  return _parseCookie(cookieHeader, name);
}
