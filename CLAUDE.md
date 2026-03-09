# CLAUDE.md — aibrenda-gemini

## Project Overview

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
  chat.js                   Main chat endpoint (OpenAI function calling, weather, time)
  greeting.js               Check-in / heartbeat for greeting logic
  history.js                Fetch conversation history
  subjects.js               User subjects/topics management
  voice/
    realtime-key.js         Issue ephemeral OpenAI Realtime client secret
  weather.js                Weather lookup (geocoding + Open-Meteo or similar)

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
  config.js                 Client-side configuration constants
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
npm run test:gemini-key   # Test Gemini API key
npm run test:gemini-live  # Test Gemini Live connection
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
- Use `requireSession(req, res)` in protected handlers — returns session payload or sends 401 and returns `null`.
- Cookie is set for 30 days; `AUTH_SESSION_SECRET` must be set in env.

### MongoDB (`lib/mongo.js`)
- Connection is cached on `globalThis.__brendaMongo` to survive warm Vercel function invocations.
- Default DB name: `ai_chat` (override with `MONGODB_DB`).
- DNS servers can be overridden via `DNS_SERVERS` env var (useful for Atlas SRV resolution).

### MongoDB Collections
| Collection | Purpose |
|---|---|
| `users` | User accounts, preferences (including saved location), `lastSeen` |
| `conversations` | Per-user message history (last 50 messages used as context) |
| `gemini_voice_usage_events` | Individual voice response usage events (idempotent by `voiceSessionId`+`responseId`) |
| `gemini_voice_usage_summary` | Rolling daily/weekly/monthly/total token+cost rollups per user+model |

### Chat (`api/chat.js`)
- Supports `{ message: "..." }` or `{ messages: [...] }` request body plus `localeVariant`.
- Builds context from the last 50 messages in `conversations` collection.
- **Time queries** are handled server-side (bypass OpenAI) using the weather API for timezone.
- **Weather queries** use OpenAI function calling (`get_weather`, `set_home_location`).
- Saved location (`users.preferences.location`) is used automatically when no city is given.
- Persists user + assistant messages to MongoDB after every response.

### Multilingual Support
- Supported locales: `en-US`, `en-GB`, `es-ES`, `es-419`
- Language is derived from `localeVariant` in requests.
- Brenda's system prompt adapts per locale.
- Spanish time is formatted as full natural language ("Son las tres y cuarto de la tarde").

### Voice (`api/voice/realtime-key.js`)
- Issues a short-lived `client_secret` from OpenAI Realtime API.
- The frontend (`voiceAgent.js`) uses this secret for WebRTC directly with OpenAI.
- Voice, model, and instructions are configurable via env vars.

### Usage Tracking (`lib/usage.js`)
- `recordVoiceUsage()` writes to `gemini_voice_usage_events` (idempotent) and updates `gemini_voice_usage_summary`.
- Pricing table in `lib/usage.js` — update if model pricing changes.

---

## Important Notes

- **ESM only** — always use `import`/`export`, never `require()`.
- **No build step** — frontend files are served as-is from `public/`.
- **`server.js` is gitignored** — never commit it. It is the local Express dev wrapper.
- **`package-lock.json` is gitignored** — do not commit it.
- Vercel deployment happens automatically on push to the connected branch.
- Weather API fetches are internal (`/api/weather`) — `chat.js` calls weather as a sub-request using the same host and forwarding cookies.
