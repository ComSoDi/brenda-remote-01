# Task: Rebuild Brenda's Android app as a native WebView shell (replacing the TWA)

## Context

Brenda is a voice + chat conversational AI web app (Node.js/Express + MongoDB, Gemini native-audio for voice, live transcription of both speakers). It is currently published to Google Play as a **Trusted Web Activity (TWA)** and is in the middle of a **14-day Closed Test**. We are replacing the TWA with a **native Android WebView shell written in Kotlin** (no Capacitor, no Cordova) that loads the hosted Brenda web app.

The #1 non-negotiable requirement: **a voice conversation must never go dead because the screen times out, the screensaver starts, or the user locks the phone.** Brenda's voice must keep playing and the microphone must keep capturing the user's voice even when the user is not looking at the screen.

The #2 non-negotiable requirement: **Brenda must keep working in regular browsers on every other platform** (iPhone/iPad Safari, desktop Chrome/Edge/Firefox/Safari on PC and Mac, and mobile browsers on Android). The Android shell is an additional client of the same hosted web app, not a replacement for it. One codebase, one server; all web-side changes must be no-ops outside the shell.

**Authentication** is a simple Nick + PIN form handled by our own server. There is no OAuth of any kind, so no Custom Tab or Credential Manager work is needed. The only auth concern in the shell is session cookie persistence (see Part B).

## Ground rules (read before touching anything)

1. **Protect working code.** Do all work on a new branch (`feature/android-webview-shell`). Do not refactor, reformat, or "improve" any existing web app code beyond the minimal, clearly-scoped additions described in Part C. If you think something else should change, list it as a suggestion; do not do it.
2. **Plan before code.** Complete Phase 1 (investigation) and stop. Present findings and a plan, then wait for my explicit approval before writing any code.
3. **No secrets in the repo.** Never commit keystores, keystore passwords, or signing configs with credentials. Use `keystore.properties` (gitignored) or environment variables.
4. **Windows dev machine with DeepFreeze on C:.** Anything on `C:` is wiped on reboot. Persistent files live under `D:\UsuariosD\enfor\`. This matters for Android tooling (see Part D). Never suggest storing anything important on `C:`.

---

## Phase 1: Investigate and report (no code yet)

Inspect the repo and the existing TWA project, then report back on each of these:

1. **Existing TWA project:** where it lives, its `applicationId`, current `versionCode`/`versionName`, `minSdk`/`targetSdk`, the start URL and domain(s), and how signing is configured (Play App Signing + upload key?). Where is the upload keystore file?
2. **Microphone capture in the web app:** how audio is captured (`getUserMedia`, `AudioWorklet`, `ScriptProcessor`, etc.), how Brenda's audio is played back, and how the connection to Gemini works (WebSocket from the browser directly, or via our server?).
3. **Visibility/lifecycle handling in the web app:** any `visibilitychange`, `pagehide`, `blur`, or `freeze` handlers that pause, stop, or tear down audio or the connection. These would sabotage the keep-alive work and must be identified.
4. **Wake Lock:** does the web app use `navigator.wakeLock` during conversations? It is the only way to prevent screen timeout for **browser** users (supported in current Chrome, Edge, Safari including iOS 16.4+, and recent Firefox), but as far as we know it does not work in Android WebView, so the shell cannot rely on it. If it is missing, include adding it (acquire on conversation start, re-acquire on `visibilitychange` back to visible, release on end, feature-detected and wrapped in try/catch) in the plan.
5. **Authentication (Nick + PIN):** how the session is stored (cookie name, `HttpOnly`/`Secure`/`SameSite` attributes, expiry), so the shell keeps users logged in across app restarts.
6. **File inputs:** any `<input type="file">` or upload features that would need `onShowFileChooser`.
7. **External links:** any links to other domains, `mailto:`, `tel:`, `intent:` URLs, payment pages, etc.
8. **Conversation start/end points:** the exact functions in the web code where a voice conversation starts and ends (these are where the native bridge calls go).
9. **Current Google Play target API requirement:** confirm the minimum `targetSdk` Google Play currently requires for app updates, and use that.
10. **Local dev setup:** the port the Node server listens on locally and how it is started, for the debug build (Part F).

Then present a numbered implementation plan with the files you'll create or modify. **Stop and wait for approval.**

---

## Phase 2: Implementation (after approval)

### Part A: Project and identity (critical for the Closed Test)

- **Keep the exact same `applicationId` as the TWA.** Changing it creates a brand-new app and restarts the 14-day clock.
- **Sign with the same upload key.** Bump `versionCode` above the current one.
- Output a signed **AAB** for upload to the existing Closed Testing track, so testers receive it as a normal update.
- Kotlin, single-activity app, AndroidX, `androidx.webkit` for modern WebView APIs.
- Remove TWA dependencies (`androidbrowserhelper`, etc.) from the build. Leaving the website's `assetlinks.json` in place is harmless.

### Part B: The WebView shell

**WebView configuration**
- `javaScriptEnabled = true`, `domStorageEnabled = true`, `mediaPlaybackRequiresUserGesture = false` (so Brenda's voice plays without an extra tap).
- `mixedContentMode = MIXED_CONTENT_NEVER_ALLOW`.
- `CookieManager`: accept cookies; call `flush()` in `onPause`/`onStop` so sessions persist.
- Append a marker to the user agent (e.g. ` BrendaAndroid/<versionName>`) so the web app can detect it's running in the shell. Do not replace the default UA.
- Handle `onRenderProcessGone`: recreate the WebView and reload gracefully instead of letting the app crash (the default behavior is a crash).

**Microphone permissions (the WebView will fail silently without all of these)**
- Manifest: `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, `INTERNET`.
- Request `RECORD_AUDIO` at runtime with a short rationale.
- Override `WebChromeClient.onPermissionRequest()`: grant **only** `RESOURCE_AUDIO_CAPTURE`, and **only** for our own origin(s). Deny everything else.
- If the runtime permission isn't granted yet, request it first, then grant or deny the pending WebView request based on the result.
- If permanently denied, show a friendly explanation with a button that opens the app's system settings.

**Navigation**
- `shouldOverrideUrlLoading`: our own domain(s) stay in the WebView; everything else (other domains, `mailto:`, `tel:`, etc.) opens externally via an Intent.
- Back button (`OnBackPressedDispatcher`): navigate back in WebView history if possible, otherwise default behavior. **During an active conversation**, back should move the app to the background (not destroy the activity), so the conversation continues.

**Authentication (Nick + PIN)**
- No special handling: the login form posts to our own server inside the WebView.
- Make sure the session cookie survives app restarts (`CookieManager` accept + `flush()`, as above). Users must not have to re-enter their PIN every time they open the app.
- Future note for `ANDROID_SHELL.md`: if "Sign in with Google" is ever added, Google blocks OAuth inside embedded WebViews (`disallowed_useragent`), so it will need a Custom Tab or Credential Manager at that point.

**Offline and error handling**
- On main-frame load errors (`onReceivedError` with `request.isForMainFrame`), show a native offline screen with a Retry button instead of the default error page.
- Use the AndroidX SplashScreen API for a proper native splash.
- File chooser via `onShowFileChooser` only if Phase 1 found file inputs.

### Part C: Keeping the conversation alive (the critical requirement)

This is two layers. Both are required.

**Native-to-web bridge**
- Use `WebViewCompat.addWebMessageListener` (from `androidx.webkit`) with an **allowed-origins rule restricted to our domain(s)**. Prefer this over `addJavascriptInterface`, which exposes the bridge to any page loaded in the WebView.
- Messages from web → native:
  - `conversation:start` → activate Layers 1 and 2
  - `conversation:end` → deactivate both
  - `screen:dim` / `screen:undim` → optional low-brightness mode
- Messages from native → web:
  - `conversation:endRequested` (user tapped "End" in the notification)
  - `audio:interrupted` / `audio:resumed` (e.g. incoming phone call, audio focus loss), if feasible

**Layer 1: Keep the screen on during a conversation (covers screen timeout and screensaver)**
- On `conversation:start`: add `WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON` on the UI thread.
- On `conversation:end`: clear it.
- Optional dim mode: lower `window.attributes.screenBrightness` (e.g. to 0.05) on `screen:dim`, restore on `screen:undim` and on conversation end. This saves battery while keeping the app in the foreground.
- Always clear the flag and restore brightness in `onDestroy` and on any error path. The screen must never get stuck on after a conversation ends.

**Layer 2: Foreground service (covers power button, app switching, and aggressive OEMs)**
- Create a foreground service with `foregroundServiceType="microphone|mediaPlayback"`.
- Manifest permissions: `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MICROPHONE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `POST_NOTIFICATIONS`, `WAKE_LOCK`.
- Request `POST_NOTIFICATIONS` at runtime on Android 13+.
- **Start the service on `conversation:start` while the activity is in the foreground** (Android 14+ does not allow starting a microphone-type foreground service from the background).
- Persistent, low-priority notification: "Brenda is listening" with an **End conversation** action that sends `conversation:endRequested` to the web page. Tapping the notification returns to the app.
- While active, hold a `PARTIAL_WAKE_LOCK` and a `WifiLock` (`WIFI_MODE_FULL_LOW_LATENCY` where available), with a safety timeout, released reliably on `conversation:end`, service destroy, and all error paths.
- Stop the service on `conversation:end`.

**WebView lifecycle during a conversation**
- Call `webView.setRendererPriorityPolicy(RENDERER_PRIORITY_IMPORTANT, false)` so the renderer keeps its priority when the app isn't visible.
- **Do NOT call `webView.onPause()` or `webView.pauseTimers()` while a conversation is active.** Only pause when no conversation is running.
- Handle process death gracefully: if the service or activity is killed, clean up locks and the notification.

**Web app changes (minimal, surgical)**
- In the conversation start/end functions identified in Phase 1, post the bridge messages when running in the shell (detect via the injected listener object or the UA marker). In a normal browser, behavior must be unchanged.
- Listen for `conversation:endRequested` and end the conversation cleanly.
- Keep (or add, per Phase 1) `navigator.wakeLock` as the screen-timeout protection for **browser** users. In the shell, the native flag does this job instead; calling the Wake Lock API there is harmless if feature-detected.
- Every web-side change must be feature-detected and a no-op in a regular browser. Browser users must see exactly the same behavior as before, apart from the wake lock improvement.
- If Phase 1 found `visibilitychange`/`pagehide` handlers that stop audio or the connection, make them **skip that behavior when running in the shell with a conversation active.** Show me the exact diff before applying it.

### Part D: Build environment (DeepFreeze on C:)

- Make sure the Android SDK, `GRADLE_USER_HOME`, and Android Studio config/caches point to locations under `D:\UsuariosD\enfor\`, not `C:`. Tell me which settings and environment variables to set if they aren't already.
- **The upload keystore must live on D: and must be backed up somewhere off the machine.** Losing it would block updates. Confirm its location and remind me to back it up.

### Part E: Play Console paperwork (draft the text for me)

- **Foreground service declaration:** draft the justification for the `microphone` and `mediaPlayback` foreground service types (real-time two-way voice conversation with an AI assistant that must continue when the screen is off). Note if a demo video is needed.
- **Data safety form:** list what should be reviewed given microphone/audio access.
- **Release notes** for the Closed Test update, describing the change in user terms.

### Part F: Local development and debugging

- Running and testing the web app locally in a desktop browser must keep working exactly as today. Nothing in this task may change that workflow.
- Create `debug` and `release` build variants. Debug loads `http://localhost:<PORT>` (port from Phase 1); release loads the production URL. Use a `BuildConfig` field, never a hardcoded URL, so a build pointing at a laptop can never ship to testers.
- Debug only: a network security config allowing cleartext traffic for `localhost` only. Release must not allow cleartext at all.
- Debug only: include `http://localhost:<PORT>` in the bridge's allowed origins.
- Debug only: `WebView.setWebContentsDebuggingEnabled(true)` so the page can be inspected at `chrome://inspect` on the PC.
- Document the local workflow in `ANDROID_SHELL.md`: start the Node server, run `adb reverse tcp:<PORT> tcp:<PORT>`, install the debug build. Note that the microphone requires a secure context: `http://localhost` qualifies, but `http://10.0.2.2` and LAN IPs over HTTP do not, so `getUserMedia` will fail with those.

---

## Phase 3: Test plan

Give me a checklist to run on a real device (ideally one Samsung or Xiaomi as well, since their battery managers are aggressive). For each scenario, test both **while Brenda is speaking** and **while I'm speaking**:

1. Let the screen time out naturally.
2. Press the power button to lock the phone, wait 60 seconds, keep talking.
3. Switch to another app, keep talking, then return.
4. Plug in the charger (can trigger the system screensaver).
5. Tap "End conversation" from the notification.
6. Receive a phone call mid-conversation.
7. Turn airplane mode on, then off (offline screen and recovery).
8. Deny the microphone permission, then grant it from settings.
9. Confirm that after a conversation ends: screen timeout works normally again, brightness is restored, the notification is gone, and no wake lock is held (`adb shell dumpsys power`).
10. Kill the WebView renderer (`adb shell am crash` on the renderer or use `chrome://crash` equivalent) and confirm the app recovers instead of crashing.
11. Log in with Nick + PIN, force-close the app, reopen it, and confirm the session is still active.
12. Run the debug build against the local server via `adb reverse` and confirm the microphone works.

**Browser regression checks (outside the Android app):**

13. Full voice conversation in desktop Chrome (PC or Mac): login, talk, hear Brenda, transcript displays correctly.
14. Full voice conversation in iPhone Safari, including confirming the wake lock keeps the screen on during a conversation and releases afterward.
15. Full voice conversation in Chrome on Android (the browser, not the app).
16. Confirm no errors in the browser console related to the bridge or shell detection in any of the above.

Note for browser users: manually locking an iPhone mid-conversation will cut the microphone in Safari, and there is no web workaround. That is expected; only screen *timeout* is covered for browsers (via wake lock).

Also give me the exact `adb` commands useful for verifying wake locks, foreground service state, and audio focus.

## Deliverables

- Signed AAB with the same `applicationId`, higher `versionCode`.
- A short `ANDROID_SHELL.md` in the repo explaining the architecture, the bridge messages, the local debug workflow (Part F), how to build and release, and the OAuth future note.
- The Play Console texts from Part E.
- A summary of every web app file changed, with diffs.
