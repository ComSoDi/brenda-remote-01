# iaBrenda Project

## Overview

**Soy iaBrenda** is a multilingual AI chat and voice assistant deployed on Vercel. The AI persona is named "Brenda". It supports text chat (via OpenAI) and real-time voice (via OpenAI Realtime API / WebRTC). The frontend is vanilla JS with no framework.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20.x, ESM (`"type": "module"`) |
| Deployment | Vercel (serverless functions) |
| Local dev | Express + nodemon via `server.js` (gitignored) |
| Database | MongoDB Atlas |
| Chat AI | OpenAI (gpt-4o-mini by default) |
| Voice AI | OpenAI Realtime API (gpt-4o-mini-realtime-preview) |
| Auth | Custom HMAC-SHA256 signed session cookies |
| Frontend | Vanilla JS, HTML, CSS |

---

## Project Structure

```
api/                        Vercel serverless handlers (export default async function handler)
  auth/
    anonymous.js            Create anonymous session
    login.js                Username/password login
    logout.js               Clear session cookie
    me.js                   Return current session info
  conversation/
    append.js               Append message to conversation
  transcript/
    correct.js              Transcript correction endpoint
  chat.js                   Main chat endpoint (OpenAI function calling, weather, time)
  greeting.js               Check-in / heartbeat for greeting logic
  history.js                Fetch conversation history
  subjects.js               User subjects/topics management
  weather.js                Weather lookup (geocoding + Open-Meteo)
  voice/
    realtime-key.js         Issue ephemeral OpenAI Realtime client secret

lib/                        Shared utilities (bundled into Vercel functions via vercel.json)
  auth.js                   Session sign/verify/get/require + cookie helpers
  mongo.js                  MongoDB connection (cached on globalThis.__brendaMongo)
  usage.js                  Voice token usage normalization, cost calculation, DB rollups

public/                     Static frontend (served as SPA)
  index.html                Main app shell ("Soy iaBrenda")
  app.js                    Core application logic
  voiceAgent.js             WebRTC / OpenAI Realtime voice agent
  pcm-processor.js          AudioWorklet PCM processor (Web Audio API)
  conversationContent.js    Conversation rendering logic
  transcriptRenderer.js     Transcript display
  i18n.js                   Translations and i18n helpers
  locale.js                 Locale detection and switching
  config.js                 Voice backend selection, locale-specific voice instructions,
                            turn detection tuning, buildRealtimeInstructions()
  styles.css                All styles
  help-texts.html           Help overlay content
  privacy.html              Privacy policy page
  images/                   App images and icons
```

---

## Environment Variables

Create a `.env` file (gitignored) for local dev:

```
# OpenAI
OPENAI_API_KEY=
OPENAI_CHAT_MODEL=gpt-4o-mini
OPENAI_REALTIME_MODEL=gpt-4o-mini-realtime-preview
OPENAI_VOICE=alloy
OPENAI_REALTIME_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
OPENAI_REALTIME_INSTRUCTIONS=

# MongoDB
MONGODB_URI=
MONGODB_DB=ai_chat

# Auth
AUTH_SESSION_SECRET=

# Optional: custom DNS for MongoDB SRV resolution
DNS_SERVERS=
```

On Vercel, set the same variables in the project environment settings.

---

## Dev Commands

```bash
npm run dev           # Local dev with nodemon (requires server.js, which is gitignored)
npm run vercel-dev    # Vercel dev server on port 3000
```

> `server.js` is gitignored — it exists only in the local working directory for development.

---

## Key Architectural Patterns

### Vercel Serverless Functions
- All files under `api/` export a default `handler(req, res)` function.
- `vercel.json` rewrites `/api/*` to the functions and everything else to `index.html` (SPA).
- `lib/**` is bundled into every function via `vercel.json` `includeFiles`.

### Session Auth (`lib/auth.js`)
- Sessions are HMAC-SHA256 signed tokens stored in an `HttpOnly` cookie named `brenda_session`.
- Use `requireSession(req, res)` in protected handlers — returns session payload or sends 401.
- Cookie is set for 30 days; `AUTH_SESSION_SECRET` must be set in env.
- Passwords are hashed with `bcryptjs` (see `api/auth/login.js`).

### MongoDB (`lib/mongo.js`)
- Connection is cached on `globalThis.__brendaMongo` to survive warm Vercel function invocations.
- Default DB name: `ai_chat` (override with `MONGODB_DB`).

### MongoDB Collections
| Collection | Purpose |
|---|---|
| `users` | User accounts, preferences (saved location), `lastSeen` |
| `conversations` | Per-user message history (last 50 messages used as context) |
| `gemini_voice_usage_events` | Individual voice response usage events (idempotent by `voiceSessionId`+`responseId`) |
| `gemini_voice_usage_summary` | Rolling daily/weekly/monthly/total token+cost rollups per user+model |

> The `gemini_` prefix is a legacy artifact — these collections now store OpenAI Realtime usage.

### Chat (`api/chat.js`)
- Supports `{ message }` or `{ messages }` request body plus `localeVariant`.
- Time queries handled server-side (bypass OpenAI) using the weather API for timezone.
- Weather queries use OpenAI function calling (`get_weather`, `set_home_location`).
- Saved location (`users.preferences.location`) is used automatically when no city is given.
- Persists user + assistant messages to MongoDB after every response.

### Multilingual Support
- Supported locales: `en-US`, `en-GB`, `es-ES`, `es-419`
- Language is derived from `localeVariant` in requests.
- **Temperature units**: `en-US` → Fahrenheit; all other locales → Celsius.
  Enforced in both `api/chat.js` system prompts and `public/config.js`.

### Voice (`api/voice/realtime-key.js`)
- Issues a short-lived `client_secret` from OpenAI Realtime API.
- Frontend (`voiceAgent.js`) uses this secret for WebRTC directly with OpenAI.
- Active voice backend: `"openai-realtime"` (`Config.VOICE_BACKEND` in `public/config.js`).
- A Gemini Live config block also exists in `public/config.js` but is **not** the active path.

---

## Important Notes / Constraints ⚠️

- **ESM only** — always use `import`/`export`, never `require()`.
- **No build step** — frontend files are served as-is from `public/`.
- **`server.js` is gitignored** — never commit it.
- **`package-lock.json` is gitignored** — do not commit it.
- **Vercel auto-deploys on push** — never suggest adding a bundler.
- Error handling: never swallow exceptions silently.
- Environment config via `.env` — never hardcode secrets.
- Before modifying any file previously marked "accepted" or "working", flag it and wait for confirmation.

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
1. Query Engram for the `iabrenda` namespace
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
namespace: iabrenda
tags: [accepted|decision|bugfix|warning|handoff]
module: <module or file name>
status: accepted | in-progress | broken | deprecated
summary: <one clear sentence>
detail: <as needed>
date: <session date>
agent: claude-code
```
