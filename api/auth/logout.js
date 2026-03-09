// api/auth/logout.js
import { clearSessionCookie } from "../../lib/auth.js";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  clearSessionCookie(res);
  return json(res, 200, { ok: true });
}
