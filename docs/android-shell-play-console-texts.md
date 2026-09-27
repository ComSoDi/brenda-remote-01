# Play Console text drafts — Android shell release

Drafts only — review and adjust before pasting into Play Console. Grounded in
what the app actually does (cross-checked against `public/privacy.html`
where relevant); flagged anywhere I'm not fully certain something is
accurate rather than guessing.

## Foreground service declaration

**Type:** `microphone`, `mediaPlayback`

**Justification (draft text for the form):**
> Brenda is a real-time, two-way voice conversation with an AI assistant.
> The foreground service keeps the microphone active and audio playing for
> the duration of a conversation the user explicitly started, including
> when the screen turns off or the user switches to another app — the same
> way a phone call continues after the screen locks. It is only active
> during a live conversation the user initiated by tapping "Talk," is
> visibly shown via a persistent notification the whole time ("Brenda is
> listening"), and the user can end it at any moment either from the app or
> directly from that notification's "End conversation" action. It is never
> started in the background without the user having just initiated a
> conversation in the foreground.

**Demo video:** Play Console has been asking for a short demo video to
justify microphone-type foreground services on recent submissions — worth
recording one before submitting: open the app, start a voice conversation,
lock the phone (or switch apps), show the persistent notification, keep
talking to show the conversation is still live, then end it from the
notification and show the notification/lock disappearing cleanly. ~30-60
seconds is typically enough.

## Data Safety form — what to review

- **Audio (microphone) — collected:** Yes, voice input during a TALK
  conversation.
- **Is it stored/retained?** Per `privacy.html`'s existing language: raw
  audio itself is never recorded or stored — it's processed in real time and
  discarded. The *transcription* (text) of the conversation is stored, tied
  to the user's account, to show recent conversation history and let Brenda
  remember context. Make sure the Data Safety form's audio-data answer
  matches this exactly (collected but not retained as audio; a text
  transcript is retained).
- **Shared with third parties?** This is worth double-checking before
  submitting, not just for the form but for the underlying privacy policy
  too: voice audio and chat text are sent to Gemini (Google's AI model) for
  processing. `privacy.html` currently describes this only as "our AI
  processing service" without naming the third party explicitly. Play
  Store's own AI-content policy expects this kind of third-party data flow
  to be disclosed in both the privacy policy *and* the Data Safety section —
  worth naming Gemini/Google explicitly in both places before this
  submission, not just answering the form in isolation.
- **Encrypted in transit?** Yes — HTTPS/WSS throughout.
- **Can users request deletion?** Yes — the existing account-deletion flow
  (`public/delete-account.html`, `api/auth/delete-account.js`) already
  covers this; the Data Safety form should reference it.
- **Purpose for microphone data:** App functionality (core conversational
  feature) — not advertising, not analytics.

## Release notes (Closed Test update)

Plain-language, for testers — draft:

> Brenda now keeps your conversation going even if your screen turns off or
> you switch to another app while talking — handy for hands-free chats. No
> other changes to how you use the app; sign in and talk to Brenda exactly
> as before.
