import * as crypto from "node:crypto";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }

  const clientId    = process.env.GOOGLE_CLIENT_ID;
  const callbackUrl = process.env.GOOGLE_CALLBACK_URL;
  const loginHint   = process.env.DASHBOARD_ALLOWED_EMAIL || "";

  if (!clientId || !callbackUrl) {
    res.statusCode = 500;
    res.end("Google OAuth not configured");
    return;
  }

  const state = crypto.randomBytes(16).toString("hex");

  // CSRF state stored in a short-lived cookie (5 min)
  res.setHeader("Set-Cookie", `oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=300`);

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  callbackUrl,
    response_type: "code",
    scope:         "openid email",
    state,
    ...(loginHint ? { login_hint: loginHint } : {}),
  });

  const googleUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  console.log("[auth/google] redirecting to Google, state:", state.slice(0, 8));
  res.redirect(302, googleUrl);
}
