// api/auth/me.js
import { getSession } from "../../lib/auth.js";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  const s = getSession(req);
  if (!s?.userId) return json(res, 200, { userId: null });

  return json(res, 200, {
    userId: s.userId,
    username: s.username || "",
    displayName: s.isAnonymous ? "anonymous" : (s.username || ""),
    isAnonymous: !!s.isAnonymous,
  });
}
