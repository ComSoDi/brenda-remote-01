# iaBrenda Project

## Overview

**Soy IA Brenda** is a multilingual AI chat and voice assistant deployed on **Render**. The AI persona is named "Brenda". It supports text chat (via Gemini) and real-time voice (via Gemini Live). The frontend is vanilla JS with no framework.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20.x, ESM (`"type": "module"`) |
| Deployment | **Render** (Express server, `server.js`) — main web service; standalone `brenda-voice-proxy` service (`voice-proxy/`, see `render.yaml`) |
| Local dev | Express + nodemon via `server.js` (tracked in git) |
| Database | MongoDB Atlas — single cluster/DB (`ai_chat`) for local dev and production, no separate dev/prod split |
| Chat AI | Gemini (`gemini-2.5-flash` by default) |
| Voice AI | Gemini Live (`gemini-2.5-flash-preview-native-audio-dialog`) |
| Auth | Custom HMAC-SHA256 signed session cookies |
| Frontend | Vanilla JS, HTML, CSS |

> **Vercel note:** `vercel.json` still exists in the repo but is legacy/unused — the app no longer deploys there. Don't suggest Vercel-specific tooling or `vercel-dev` as the real dev path; `api/*.js` handlers keep the `handler(req, res)` convention for historical/portability reasons, but the actual routing is the explicit `app.get/post/all(...)` registrations in `server.js`.

---

## Project Structure

```
api/                        Handler modules (export default async function handler(req, res)),
                             wired into Express via explicit routes in server.js
  auth/
    anonymous.js            Create anonymous session
    login.js                Nick+PIN login (creates account on new Nick; hard-locks after 3 wrong
                             PIN attempts on an existing Nick — see Login & Lockout below)
    logout.js                Clear session cookie
    me.js                    Return current session info
    google.js                Google OAuth — redirect to consent screen
    google-callback.js       Google OAuth — exchange code, establish session
    consent.js               Record first-login AI-consent acceptance
    decline-consent.js       Decline consent — erases unused (no-history) accounts
    talk-disclaimer.js       Record first-TALK-tap voice disclaimer acceptance
    policy-accept.js         Record on-demand privacy-policy popup acknowledgement
    delete-account.js        Two-step-verified account deletion (Google Play compliance)
  conversation/
    append.js                Append message to conversation
  transcript/
    correct.js               Transcript correction endpoint
  user/
    usage.js                 Current-period usage/quota status
    plan.js                  Switch subscription plan (upgrade immediate, downgrade deferred)
    topup.js                 Add a one-time Top-up (uncapped free Brendys) to a subscription
  rds/
    state.js                 RDS memory summary / "forget"/"intro-shown" actions
    interests.js              Read/replace declaredInterests (up to 5)
    topic-starter.js          Generate a progressive RDS conversation starter
  brenda/
    categories.js             Saved news-category preferences (ai_categories collection)
    headlines.js               Ranked headlines for the session user
    gossip.js                  Brenda reacts to a tapped headline card
    greet.js                   Water-cooler session-opener built from headlines
    search.js                  Current-events Q&A with Gemini google_search grounding
  dashboard/
    users.js, voice-events.js, chat-events.js   Read-only admin dashboard data endpoints
                                                  (own HMAC session via lib/dashboard-auth.js)
  chat.js                    Main chat endpoint (Gemini function calling, deterministic weather/time)
  greeting.js                Check-in / heartbeat for greeting logic + pending task_reminders
  history.js                 Fetch conversation history
  plans.js                   List available subscription plans
  tasks.js                   Task reminders CRUD (renamed from "medications" — see Tasks below)
  weather.js                 Weather lookup (geocoding + Open-Meteo), saved location management
  voice/
    realtime-key.js          Issue ephemeral OpenAI Realtime client secret (fallback path, inactive)

lib/                        Shared utilities (bundled locally; NOT available to voice-proxy/, see below)
  auth.js                   Session sign/verify/get/require + cookie helpers
  dashboard-auth.js         Separate HMAC session for the admin dashboard (its own cookie)
  mongo.js                  MongoDB connection (cached on globalThis.__brendaMongo)
  usage.js                  Voice + chat token usage normalization, cost calculation, DB rollups
  subscriptions.js          Subscription period + usage lookup helpers (Phase 2-4 of usage
                             monitoring); computes usage on demand from usage_events, no duplicate
                             running counter on users.usage
  plans.js                  Subscription tier constants/seed data — quota tracked as "Brendys"
                             (1 Brendy = 1 raw Gemini token; the word "tokens" never reaches
                             user-facing i18n strings)
  rdsService.js             Relationship Discovery System — state management + chat integration
  brendaGossip.js           Single Gemini call (w/ Google Search grounding) for headline reactions

voice-proxy/                 Standalone Node service (own package.json), deployed separately on
                            Render (render.yaml, rootDir: voice-proxy) as "brenda-voice-proxy".
                            Handles /api/voice/stream when the client is pointed at it via
                            VOICE_PROXY_WS_URL (cross-domain path). Can't import from lib/ — the
                            main repo isn't part of its deploy — so session/subscription/usage
                            logic needed there is intentionally duplicated, not shared. Runs the
                            only live Agenda.js scheduler ("check-task-reminders", polls every
                            1 minute) — this does NOT run under local `npm run dev`.

public/                     Static frontend (served as SPA)
  index.html                Main app shell ("Soy IA Brenda")
  app.js                    Core application logic
  taskManager.js            Task-reminder panel UI manager (renamed from medicationManager.js)
  task-styles.css           Task-reminder panel styles (renamed from med-styles.css)
  voiceAgent.js             Gemini Live voice agent (WebSocket + PCM audio)
  pcm-processor.js          AudioWorklet PCM processor (Web Audio API)
  conversationContent.js    Conversation rendering logic
  transcriptRenderer.js     Transcript display
  sideNavManager.js         SideNav Help System panel manager
  i18n/                     Per-locale translation tables (en-US, en-GB, es-ES, es-419) + index.js
  locale.js                 Locale detection and switching
  config.js                 Voice backend selection (VOICE_BACKEND), locale-specific voice
                            instructions, Gemini + OpenAI Realtime VAD tuning,
                            genderAddressLine(), resolveLocaleVariant(), buildRealtimeInstructions()
  styles.css                All shared/base styles
  help-texts.html           Help overlay content
  privacy.html              Standalone privacy policy page — 4-locale, browser-language-detected,
                             kept as a real page (not just a popup) for the Play Store's
                             <link rel="privacy-policy"> requirement
  delete-account.html       Standalone account-deletion info page — same pattern as privacy.html,
                             live at aibrenda.co/delete-account.html for Play Console's required
                             "Delete account URL"
  offline.html               PWA offline fallback page
  service-worker.js          PWA service worker
  dashboard/                 Admin usage/cost dashboard (own auth via lib/dashboard-auth.js)
  images/                   App images and icons

scripts/                    One-off Node scripts, registered in package.json as `npm run migrate:*`
                             / other `npm run` commands (idempotent, safe to re-run). Includes the
                             meds→tasks rename migrations — see Tasks below for cleanup intent.
```

---

## Environment Variables

Create a `.env` file (gitignored) for local dev:

```
# Gemini (chat + voice)
GEMINI_API_KEY=
GEMINI_CHAT_MODEL=gemini-2.5-flash

# OpenAI (Realtime voice fallback path only — inactive by default)
OPENAI_API_KEY=
OPENAI_REALTIME_MODEL=gpt-4o-mini-realtime-preview
OPENAI_VOICE=alloy
OPENAI_REALTIME_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
OPENAI_REALTIME_INSTRUCTIONS=

# MongoDB
MONGODB_URI=
MONGODB_DB=ai_chat

# Auth
AUTH_SESSION_SECRET=

# Optional: custom DNS for MongoDB SRV resolution (needed on some Windows/local networks)
DNS_SERVERS=
```

Set the same variables in the Render service's environment settings (main web service and, where
applicable, the separate `brenda-voice-proxy` service).

---

## Dev Commands

```bash
npm run dev            # Local dev with nodemon (server.js) — the real local dev path
```

> `server.js` is tracked in git — it's the real local dev server AND effectively documents the
> production routing (Render runs the same Express app), including the `/api/voice/stream`
> WebSocket upgrade handler (session + quota gate live here). Changes to it need to be committed
> like any other file.

---

## Key Architectural Patterns

### API Handler Convention
- All files under `api/` export a default `handler(req, res)` function (a legacy Vercel-style
  convention, kept for consistency — not because the app deploys on Vercel).
- Every handler is explicitly wired into Express with `app.get/post/all(...)` in `server.js`;
  there is no filesystem-based routing in production.
- Shared code in `lib/**` is imported directly (normal Node `import`, no bundler step).

### Session Auth (`lib/auth.js`)
- Sessions are HMAC-SHA256 signed tokens stored in an `HttpOnly` cookie named `brenda_session`.
- Use `requireSession(req, res)` in protected handlers — returns session payload or sends 401.
- Cookie is set for 30 days; `AUTH_SESSION_SECRET` must be set in env.
- Passwords (PINs) are hashed with `bcryptjs` (see `api/auth/login.js`).
- The admin dashboard uses a **separate** HMAC session (`dashboard_session` cookie, 8h) via
  `lib/dashboard-auth.js` — not the same session as the main app.

### Login & Lockout (`api/auth/login.js`)
- New Nick → creates an account.
- Existing Nick + wrong PIN → increments `users.preferences.failedPinAttempts`; after 3 wrong
  attempts the account **hard-locks** (`preferences.lockedAt` set) — every further attempt, even
  the correct PIN, is rejected (HTTP 423) until manually cleared in MongoDB. No auto-expiry;
  persists indefinitely across sessions/devices.
- Correct PIN resets `failedPinAttempts` to 0.
- This replaced a prior bug where wrong-PIN-on-existing-Nick silently forked a new `_1`/`_2`
  duplicate account instead of erroring.
- Deleted accounts (`userAccountStatus: "Inactive"`) are left permanently locked/unreusable for
  now — a deliberate decision, not a bug, so behaviour can be studied before deciding whether to
  free up deleted Nicks for reuse.

### Compliance Popups & Account Deletion
- **First-login AI consent popup** (Agree/Decline) — decline erases unused (no real history)
  accounts but preserves accounts with history. `api/auth/consent.js` / `decline-consent.js`.
- **First-TALK-tap voice disclaimer popup** — single-button accept, auto-connects voice after.
  `api/auth/talk-disclaimer.js`.
- **On-demand privacy-policy popup** — not gating; supplements (doesn't replace) the standalone
  `privacy.html` page. `api/auth/policy-accept.js`.
- **Account deletion** — two-step confirmation (explain consequences → re-verify Nick+PIN via
  bcrypt) before deleting. Scrubs `conversations`, `tasks`, `task_reminders`,
  `task_schedule_sync`, `rds_profiles`, `ai_categories`; leaves `subscriptions` and usage-history
  collections untouched; sets `users.userAccountStatus = "Inactive"`, clears `pinHash`, stamps
  `preferences.deleteAccountAcceptedAt`. `api/auth/delete-account.js`, entry point documented at
  `public/delete-account.html`.

### MongoDB (`lib/mongo.js`)
- Connection is cached on `globalThis.__brendaMongo` to survive warm invocations.
- Default DB name: `ai_chat` (override with `MONGODB_DB`). Same cluster/DB for local + production.

### MongoDB Collections
| Collection | Purpose |
|---|---|
| `users` | Accounts, `preferences` (location, gender, failedPinAttempts, lockedAt, deleteAccountAcceptedAt), `userAccountStatus`, `lastSeen` |
| `counters` | Sequence counters (e.g. anonymous userId generation) |
| `conversations` | Per-user message history (last 50 messages used as context) |
| `tasks` | Task reminders (renamed from `medications`; `quantity` field renamed from `dose`) |
| `task_reminders` | Pending task-reminder notifications (renamed from `medication_reminders`) |
| `task_schedule_sync` | Task schedule sync state, keyed by `taskId` (renamed from `medication_schedule_sync`) |
| `rds_profiles` | Relationship Discovery System — declaredInterests, learned facts by domain |
| `ai_categories` | Saved news-category preferences (api/brenda/*) |
| `plans` | Subscription tier definitions/seed data |
| `subscriptions` | Per-user subscription state (plan, period, deferred downgrades, top-ups) |
| `gemini_voice_usage_events` / `_summary` | Per-response voice usage events / rolling rollups |
| `gemini_chat_usage_events` / `_summary` | Per-response chat usage events / rolling rollups, grouped by `chatSessionId` |

> The `gemini_` prefix matches the active Gemini backend for both chat and voice.

### Chat (`api/chat.js`)
- Uses Gemini (`GEMINI_API_KEY` / `GEMINI_CHAT_MODEL`). Message history is converted via `toGeminiContents()`.
- Supports `{ message }` or `{ messages }` request body plus `localeVariant`.
- **Deterministic weather branch**: weather and time queries bypass Gemini tool-calling — handled server-side via `/api/weather`, then formatted directly. Prevents the model from re-asking for location it already has.
- **Gemini function declarations** (`GEMINI_TOOLS`): `get_weather` and `set_home_location` — only used for requests that slip past the deterministic branch.
- **City disambiguation**: `parseWeatherCityFromMessage()` extracts city/country from natural language; ambiguous names trigger a clarification turn.
- **Location change detection**: `parseLocationChangeRequest()` detects "set my location to X" patterns and triggers `set_home_location`.
- Saved location (`users.preferences.location`) is used automatically when no city is given; saved coordinates bypass geocoding.
- Gender-aware system prompt: reads `users.preferences.gender` for Spanish locale address form.
- Persists user + assistant messages to MongoDB after every response.

### Tasks (formerly "Medications")
- The feature was fully renamed from medication/dose terminology to task/quantity terminology —
  done deliberately in small, separately-requested increments (files, collections, CSS classes,
  identifiers) rather than one big sweep. If you see "med"/"medication" anywhere outside a
  natural-language trigger-word list (e.g. `api/chat.js`'s intent-detection word arrays, which
  intentionally still match user vocabulary like "medication"/"pill"), it's stale and likely
  missed by an earlier increment — flag it rather than assuming it's intentional.
- `api/tasks.js` (collection `tasks`), `public/taskManager.js` (`TaskManager` class), `public/task-styles.css`.
- One-time `scripts/rename-*.js` / `migrate:*` migrations were run against the live DB (no
  separate dev/prod DB) and are being kept intentionally for now — delete the whole set together
  only right before the next Google Play Store certification attempt, not before.

### Subscriptions, Plans & Top-ups (`lib/subscriptions.js`, `lib/plans.js`)
- "Monthly" = calendar month (UTC), not a rolling 30 days.
- Downgrades are deferred to the next billing period (subscriber keeps paid-tier quota until
  period end); upgrades apply immediately.
- Top-up adds free, uncapped "Brendys" (quota tokens) on top of the plan quota — `api/user/topup.js`.
- Quota is tracked internally as raw Gemini token counts ("Brendys"); never expose the word
  "tokens" in user-facing i18n strings.
- **Pricing currency by locale**: `en-GB` → £, `es-ES` → €, `en-US`/`es-419`/rest-of-world → $.
  Applies to all plan/top-up price displays.

### Relationship Discovery System (RDS) (`lib/rdsService.js`)
- Learns and remembers personal facts about the user across conversations (domains: identity,
  family, friends, hobbies, food, entertainment, places, health, values), with consent
  disclosure, a "forget that" command, and a "what do you remember?" command.
- Wired into both TEXT and TALK (voice) mode.

### Multilingual Support
- Supported locales: `en-US`, `en-GB`, `es-ES`, `es-419`
- Language is derived from `localeVariant` in requests.
- **Temperature units**: `en-US` → Fahrenheit; all other locales → Celsius.
  Enforced in both `api/chat.js` system prompts and `public/config.js`.
- Keep `public/i18n/{en-US,en-GB,es-ES,es-419}.js` key sets in sync — a key present in one locale
  file but missing in another is a bug, not an intentional per-locale omission.

### Voice
- **Active backend**: `"gemini-proxy"` (`Config.VOICE_BACKEND` in `public/config.js`).
- Frontend (`voiceAgent.js`) connects to `/api/voice/stream`, handled by `server.js`'s WS upgrade
  handler locally (or the standalone `voice-proxy/` service when `VOICE_PROXY_WS_URL` is set) —
  both require a valid, non-anonymous session and gate on the voice quota before proxying to Gemini Live.
- Voice model: `gemini-2.5-flash-preview-native-audio-dialog`. Voices: `Vindemiatrix` (Spanish), `Aoede` (English).
- VAD / turn detection tuned via `Config.TURN_DETECTION` (Gemini path) in `public/config.js`.
- Transcription language is locked to the app locale to prevent misdetection.
- `api/voice/realtime-key.js` remains for the OpenAI Realtime fallback path (`"openai-realtime"`); not active by default.
- OpenAI Realtime VAD and noise reduction settings live in `Config.OPENAI_REALTIME` in `public/config.js`.

---

## Important Notes / Constraints ⚠️

- **ESM only** — always use `import`/`export`, never `require()`.
- **No build step** — frontend files are served as-is from `public/`.
- **`server.js` is tracked in git** — commit changes to it like any other file.
- **`package-lock.json` is gitignored** — do not commit it.
- **Deploys on Render, not Vercel** — never suggest Vercel-specific tooling or say a push "goes to Vercel"; never suggest adding a bundler.
- Error handling: never swallow exceptions silently.
- Environment config via `.env` — never hardcode secrets.
- Before modifying any file previously marked "accepted" or "working", flag it and wait for confirmation.
- Single MongoDB cluster/DB for local dev and production — no separate sandbox DB. Be careful with scripts that write/delete.

---

## Memory Architecture for this Project

### Three-layer system:

**Layer 1 — CLAUDE.md (this file)**
Rules, conventions, constraints. Versioned in Git. Shared truth.

**Layer 2 — Auto-memory** (`~/.claude/projects/<project>/memory/`)
Claude's learned context: build quirks, debugging patterns, session decisions, style observations.
- `MEMORY.md` = index (loaded every session)
- Topic files = detail on demand

**Layer 3 — Engram** (`D:\UsuariosD\enfor\.engram`)
Cross-agent persistent knowledge. Survives DeepFreeze reboots.
Source of truth for: accepted code contracts, architectural decisions, inter-agent handoff notes.
Project name used for this app's entries: `iabrenda`.

### What goes in Engram vs auto-memory:
| Engram | Auto-memory |
|---|---|
| Accepted code contracts | Build commands & shortcuts |
| Architectural decisions | Debugging patterns observed |
| Cross-agent handoff notes | Style preferences |
| Stable module status registry | Session-specific context |
| Bug patterns to avoid | Workflow habits |

---

## Engram Protocol

### On session START:
1. Query Engram for the `iabrenda` project
2. Load: last known stable state, accepted modules, open issues, architectural decisions, handoff notes
3. Cross-reference with auto-memory — if they conflict, flag it, don't assume

### During a session:
- Accepted working code → store in Engram immediately (module name, what, why, date)
- Architectural decision made → store in Engram immediately
- Bug fixed in previously working code → store fix pattern AND what broke

### On session END:
- Write session summary to Engram: built, accepted, open, warnings for next agent
- Update auto-memory with tactical learnings

### Engram write format:
```
project: iabrenda
type: decision | bugfix | architecture | pattern | config | discovery
title: <short searchable title>
content: **What** / **Why** / **Where** / **Learned**
```
