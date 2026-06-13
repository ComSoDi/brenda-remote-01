import { setDashboardCookie, parseCookieValue } from "../../lib/dashboard-auth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }

  console.log("[google-callback] req.url:", req.url, "| referer:", req.headers.referer || "(none)");

  // Use req.query (Express) if available, fall back to URL parsing
  const qp     = req.query || (() => { const u = new URL(req.url, `http://${req.headers.host}`); return Object.fromEntries(u.searchParams); })();
  const code   = qp.code  || null;
  const state  = qp.state || null;
  const stored = parseCookieValue(req.headers.cookie || "", "oauth_state");

  console.log("[google-callback] code:", !!code, "state:", state?.slice(0,8), "stored:", stored?.slice(0,8));

  if (!code || !state || !stored || state !== stored) {
    console.warn("[google-callback] CSRF check failed — code:", !!code, "state===stored:", state === stored, "stored present:", !!stored);
    res.writeHead(302, { Location: "/dashboard/not-authorized.html" });
    res.end();
    return;
  }

  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const callbackUrl  = process.env.GOOGLE_CALLBACK_URL;
  const allowedEmail = process.env.DASHBOARD_ALLOWED_EMAIL || "";

  if (!clientId || !clientSecret || !callbackUrl) {
    res.statusCode = 500;
    res.end("Google OAuth not configured");
    return;
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    new URLSearchParams({
        code,
        client_id:     clientId,
        client_secret: clientSecret,
        redirect_uri:  callbackUrl,
        grant_type:    "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      throw new Error(`Token exchange failed: ${tokenRes.status}`);
    }

    const { id_token } = await tokenRes.json();
    if (!id_token) throw new Error("No id_token in response");

    // Verify identity via Google's tokeninfo endpoint
    const infoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(id_token)}`);
    if (!infoRes.ok) throw new Error(`tokeninfo failed: ${infoRes.status}`);

    const tokenInfo = await infoRes.json();
    const { email, email_verified } = tokenInfo;

    console.log("[google-callback] tokenInfo email:", email, "verified:", email_verified, "allowed:", allowedEmail);

    if (!email_verified || email !== allowedEmail) {
      console.warn("[google-callback] email check failed — got:", email, "expected:", allowedEmail);
      res.writeHead(302, { Location: "/dashboard/not-authorized.html" });
      res.end();
      return;
    }

    // Set dashboard session cookie and redirect (state cookie expires naturally in 5 min)
    setDashboardCookie(res, { email });
    res.writeHead(302, { Location: "/dashboard" });
    res.end();

  } catch (e) {
    console.error("[google-callback]", e?.message || e);
    res.writeHead(302, { Location: "/dashboard/not-authorized.html" });
    res.end();
  }
}
