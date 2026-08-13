# Voice VAD Tuning

Short manual for the `automatic_activity_detection` (voice-activity detection, "VAD")
tuning added to fix reports of *"Brenda didn't acknowledge what I said — repeating it
worked."*

## What was actually happening

Gemini Live decides on its own, from the raw audio stream, when you've started talking
and when you've finished ("turn detection"). The app was never telling it how sensitive
to be — it just used whatever Google's internal default calibration is. That default
isn't publicly documented with exact numbers; Google only describes it qualitatively as
"automatic detection, standard sensitivity." In practice it can occasionally:

- **Miss the start of a quiet/soft utterance** — nothing gets sent to the model as a
  turn at all, so there's no response and no error.
- **Fail to close a turn cleanly** on a trailing pause (background noise, breathing,
  hesitation) — the turn stays "open" and gets silently merged into whatever you say
  next, so the original question never gets a direct answer.

Either way, the result looks identical from the user's side: silence, then repeating
yourself fixes it. There's no error, no dropped connection, and no bug in our own
message handling — it's Gemini's turn-boundary decision, made before our code ever sees
a transcript.

## The fix: explicit `automatic_activity_detection` config

We now send an explicit VAD config in the `setup` message instead of leaving it unset,
tunable via environment variables (no code change needed to adjust). This is wired into
**both** places that actually talk to Gemini Live:

- [`server.js`](../server.js) — used locally (`npm run dev`) and would be used in
  production if `VOICE_PROXY_WS_URL` were unset.
- [`voice-proxy/index.js`](../voice-proxy/index.js) — the standalone
  `brenda-voice-proxy` Render service, which is what production actually uses today.
  **If you only set these env vars on one service, production behavior won't change** —
  set them on both (or on whichever one is actually handling the call you're testing).

### The knobs

| Env var | Values | What it controls |
|---|---|---|
| `GEMINI_VAD_START_SENSITIVITY` | `HIGH` \| `LOW` (default `HIGH`) | How readily Gemini flags that you've *started* talking. |
| `GEMINI_VAD_END_SENSITIVITY` | `HIGH` \| `LOW` (default `LOW`) | How readily Gemini flags that you've *finished* talking. |
| `GEMINI_VAD_PREFIX_PADDING_MS` | integer ms (default `300`) | How much audio *before* the detected start-of-speech point gets included in the turn. |
| `GEMINI_VAD_SILENCE_DURATION_MS` | integer ms (default `800`) | How long a silence has to last before Gemini decides you're done talking. |

**Direction of effect:**

- **`START_SENSITIVITY_HIGH`** → triggers on quieter/softer speech onsets, at the cost
  of being more prone to false triggers from background noise. **`LOW`** requires a
  clearer, stronger signal before it registers you've started — safer against noise,
  but more likely to *miss* soft speech entirely (which is closer to the bug we saw).
- **`END_SENSITIVITY_LOW`** → waits for a clearer, more definite pause before closing
  your turn — more patient, less likely to cut you off mid-thought or fail to close a
  turn on a noisy trailing pause, at the cost of a slightly slower reply. **`HIGH`** →
  closes the turn on the first hint of a pause — snappier responses, but more likely to
  clip you off early or misfire on a mid-sentence breath.
- **`PREFIX_PADDING_MS`** (higher) → less risk of clipping the very first syllable if
  start-of-speech detection fires a beat late. Too high just wastes a bit of audio
  bandwidth; it doesn't hurt accuracy.
- **`SILENCE_DURATION_MS`** (higher) → more patient end-of-turn detection, fewer missed
  turns, but Brenda waits longer after you stop talking before she starts replying.
  Too high starts to feel laggy/awkward in conversation.

### Chosen defaults

`START_SENSITIVITY_HIGH` + `END_SENSITIVITY_LOW` + `300ms` prefix + `800ms` silence.
This combination is deliberately asymmetric: **be generous about noticing you've
started talking** (so a soft utterance doesn't get missed entirely), but **be patient
about deciding you've stopped** (so a trailing pause doesn't get misread as the end of
your turn). That combination targets the specific failure mode reported — a turn either
never registering or getting cut off early — without making Brenda noticeably slower to
respond in normal conversation.

### If the problem persists after this

- **Still occasionally getting no response at all** → try `GEMINI_VAD_START_SENSITIVITY=HIGH`
  is already the default; next lever is raising `GEMINI_VAD_SILENCE_DURATION_MS` (e.g.
  to `1200`) if turns seem to be getting cut short rather than missed outright.
- **Brenda feels slow to respond / cuts in awkwardly** → lower
  `GEMINI_VAD_SILENCE_DURATION_MS` back toward `500`–`600`.
- **False triggers from background noise (Brenda responds to nothing)** → switch
  `GEMINI_VAD_START_SENSITIVITY` to `LOW`.

## Reading the diagnostic logs

Every turn now logs a `🗣️ [voice-vad]` line with what Gemini actually heard and said,
plus a separate line whenever Gemini reports an interruption. This exists so the next
time "she didn't respond" happens, you can check the log instead of guessing:

- **Local dev**: printed to the `npm run dev` terminal (from `server.js`).
- **Production**: printed to the `brenda-voice-proxy` service's Render logs (from
  `voice-proxy/index.js`) — check there first for a real user report, since that's the
  service production traffic actually uses.
- **Browser console**: `voiceAgent.js` logs the same turn-complete summary client-side,
  useful for your own local testing without needing to tail the server terminal.

Example:

```
🗣️ [voice-vad] session=... userId=... — turn complete. user="what's the weather in madrid" brenda="Right now in Madrid it's..."
```

If a turn you spoke never shows up as a `turn complete` line at all (and there's no
`interrupted` line either), that's Gemini's VAD failing to register the turn boundary —
confirms the theory above rather than a network drop or an app bug, and tells you which
sensitivity knob to move.

## Where to set these

Add to `.env` locally, and to the environment settings of **both** the main web service
and the `brenda-voice-proxy` service on Render for production. All four vars are
optional — anything left unset uses the defaults described above, not Google's opaque
default.
