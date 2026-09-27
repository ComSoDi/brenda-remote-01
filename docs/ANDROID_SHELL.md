# Brenda Android Shell

A native Kotlin WebView shell (`android-shell/`) that loads the hosted Brenda
web app (`https://aibrenda.co`), replacing the PWABuilder-generated TWA. Same
`applicationId` (`co.aibrenda.twa`), same upload key — this ships as a normal
update to the existing Closed Test, not a new app.

**Why this exists:** a TWA can't keep a voice conversation's microphone alive
once the screen locks or times out. This shell adds a foreground service +
`FLAG_KEEP_SCREEN_ON` specifically to solve that, while staying a thin wrapper
around the same web app every other platform uses — no logic is duplicated
natively; the web app is still the single source of truth for everything
except "keep this conversation alive while the screen is off."

## Architecture

```
 Browser (any platform)  ──────────────►  https://aibrenda.co  (unchanged)
                                              │
 Android shell (WebView) ──────────────►  https://aibrenda.co  (same server,
        │        ▲                          same code — just an
        │        │                          additional client)
   FLAG_KEEP_     │
   SCREEN_ON      │
        │    ConversationForegroundService
        ▼        (wake lock, wifi lock,
   MainActivity    persistent notification)
```

The web app has **no idea** it's inside a native shell unless it checks for
`window.BrendaNativeBridge` — that object only exists inside the shell
(injected via `WebViewCompat.addWebMessageListener`, origin-restricted to
`https://aibrenda.co`, plus `http://localhost:3000` in debug builds only). In
a regular browser, every shell-related code path in `public/app.js` is a
guaranteed no-op.

## The bridge

Two tiny helper methods in `AppController` (`public/app.js`):

- `_isInAndroidShell()` — feature-detects `window.BrendaNativeBridge`.
- `_postToShell(type)` — posts `{"type": "..."}` to native via
  `window.BrendaNativeBridge.postMessage(...)`. No-op outside the shell.

Native → web is a `CustomEvent` (`'brenda:native'`) dispatched via
`webView.evaluateJavascript(...)` — deliberately not the WebMessageListener's
reply-proxy pattern, since native needs to speak to the page at arbitrary
times (e.g. a notification tap), not only in reply to a message it just
received.

| Message | Direction | Fired from | Effect |
|---|---|---|---|
| `conversation:start` | web → native | `AppController.connectVoice()`, start of the attempt (covers the connect/handshake window too, not just a live call) | `MainActivity` sets `FLAG_KEEP_SCREEN_ON` + starts `ConversationForegroundService` |
| `conversation:end` | web → native | `AppController.hangUp()`, and `connectVoice()`'s catch block if the attempt itself fails | clears `FLAG_KEEP_SCREEN_ON` + stops the service (releases wake/wifi locks, removes the notification) |
| `screen:dim` / `screen:undim` | web → native | not currently called from the web app — wired in `MainActivity` and available if you want a low-brightness battery-saving mode later | lowers/restores `window.attributes.screenBrightness` |
| `conversation:endRequested` | native → web | user taps "End conversation" in the persistent notification | `app.js` calls `hangUp()` |

**Permission order matters (Android 14+).** `conversation:start` arrives
*before* the page's `getUserMedia()` triggers the mic prompt, and starting a
`microphone`-type foreground service without `RECORD_AUDIO` already granted
throws a `SecurityException` (this crashed the first device test). So the
service starts as `mediaPlayback` only until the mic is granted;
`MainActivity`'s mic-permission callback then calls `start()` again, which
re-promotes it to `microphone|mediaPlayback` — the `microphone` type is what
keeps capture alive with the screen off. `POST_NOTIFICATIONS` (Android 13+,
otherwise the notification is silently hidden) is requested only *after* the
mic dialog closes — a second permission request launched while one is
showing is auto-cancelled.

`ConversationForegroundService` never depends on this bridge to clean itself
up correctly — see its doc comment. The bridge is a nice-to-have (telling the
web page the call ended), not the source of truth for releasing locks.

## Keeping the conversation alive

Two independent layers, both required:

1. **`FLAG_KEEP_SCREEN_ON`** (`MainActivity`) — covers plain screen timeout
   and the screensaver, only while the app is in the foreground.
2. **`ConversationForegroundService`** — covers the power button, switching
   apps, and aggressive OEM battery managers. Holds a `PARTIAL_WAKE_LOCK` +
   `WifiLock` while a conversation is active, shown via a persistent
   low-priority notification ("Brenda is listening") with an "End
   conversation" action. Self-contained cleanup on every path: normal end,
   notification tap, service `onDestroy()` (process death), and a 2-hour
   safety-timeout backstop in case something upstream never calls end.

`MainActivity` also never calls `webView.onPause()`/`pauseTimers()` while a
conversation is active (only when nothing is running), and sets
`RENDERER_PRIORITY_IMPORTANT` so the renderer isn't starved while
backgrounded.

**Browser users get a different, browser-native mechanism** — the Wake Lock
API (`navigator.wakeLock`), added in this same change to `app.js`, acquired
around `connectVoice()`/`hangUp()` and re-acquired on `visibilitychange` per
the API's own recommended pattern (wake locks release automatically when a
tab hides). It only protects against screen *timeout* — a browser tab has no
equivalent to a foreground service, so manually locking the phone still cuts
the mic in a browser. That's expected and out of scope for browsers.

## Page layout inside the shell

- **Font size:** `WebSettings.textZoom = 100`. By default WebView multiplies
  every font by the phone's system font scale (e.g. 1.15×) on top of CSS
  that's already sized large for seniors; pinning it makes the page render
  as in Chrome / the old TWA, so `styles.css` alone decides text size.
- **Edge-to-edge (full-screen background):** targetSdk 35+ draws the app
  under the status bar, camera cutout and navigation bar. That's kept on
  purpose so `brenda-background.jpg` fills the whole screen. `MainActivity`
  passes the bar heights (in CSS px) to the page as `--shell-safe-top` /
  `--shell-safe-bottom` on `<html>` (re-sent after every page load), and the
  phone block at the end of `styles.css` adds them to `.container`'s
  padding. In a browser the vars are unset → `env(safe-area-inset-*)` → 0,
  i.e. unchanged.
- **Keyboard:** edge-to-edge disables `adjustResize`, so the shell pads the
  WebView by the IME height itself — otherwise the TEXT input would sit
  behind the keyboard.
- **JS dialogs:** `onJsAlert` / `onJsConfirm` show a native dialog titled
  "aiBrenda" instead of WebView's "The page at http://… says:". Stopgap for
  techie testers only — before real (senior) users, the web app's 9
  `alert()`/`confirm()` calls should become Brenda-styled, translated,
  per-message-titled popups (which also fixes browsers).
- **Phone header (≤499px, all phone browsers too):** compact 3-row header
  tuned for a 360×800 baseline, ≥20px bold labels, existing high-contrast
  colours.

## Shell texts & icon

- Native strings (notification, offline screen, mic-denied screen) live in
  `app/src/main/res/values/strings.xml` (English, default) and
  `values-es/strings.xml` (Spanish, one version for all regions). They follow
  the **phone's** language, not Brenda's in-app locale (that's
  `public/i18n/`). Keep both key sets identical; `app_name` is
  `translatable="false"`. System permission dialogs are translated by
  Android itself.
- Launcher icon: `public/images_play/icon-512-maskable.png` copied to
  `res/drawable-nodpi/ic_launcher_brenda.png`, inset 8.33% in
  `drawable/ic_launcher_foreground.xml` so the adaptive-icon crop (≈67%)
  matches the PWA maskable safe zone (80%). Replace both if the artwork
  changes.

## Local debug workflow

The Node server's local dev workflow (`npm run dev`, port 3000) is completely
unchanged — this only adds a way to point a WebView at it.

1. `npm run dev` in the repo root, as always.
2. Physical device: `adb reverse tcp:3000 tcp:3000` (device port 3000 → your
   PC's port 3000). Emulator: skip this — `10.0.2.2:3000` already reaches the
   host machine, and the debug build's `network_security_config.xml` allows
   both.
3. Install and run the **debug** build variant (Android Studio → Run, with
   the `debug` build variant selected — see Part D below for first-time SDK
   setup). CLI equivalent: `android-shell/gradlew.bat assembleDebug` then
   `adb install -r android-shell/app/build/outputs/apk/debug/app-debug.apk`.
   The phone needs Developer options → **USB debugging** on. If the Play
   version is installed, uninstall it first (`adb uninstall co.aibrenda.twa`)
   — same package, different signing key, so Android refuses the install.
4. `chrome://inspect` on the PC to inspect the WebView's page (enabled via
   `WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)`).

**Important:** the microphone requires a secure context. `http://localhost`
qualifies as one (special-cased by browsers/WebView); `http://10.0.2.2` and
any LAN IP over plain HTTP do **not** — `getUserMedia` will fail silently or
with a permission error on those. This is why the debug build loads
`http://localhost:3000` specifically (via `adb reverse`), not the emulator's
`10.0.2.2` alias, whenever you need the mic to actually work — `10.0.2.2` is
only listed in the network security config for convenience when testing
non-audio parts of the app on an emulator.

Debug vs. release is a `BuildConfig.SERVER_BASE_URL` field
(`android-shell/app/build.gradle.kts`), never a hardcoded URL in shared code
— a debug build can never accidentally point at production, and a release
build can never accidentally ship pointed at a laptop.

## Build environment (Part D — DeepFreeze on C:)

This machine wipes `C:` on every reboot; only `D:\UsuariosD\enfor\` is
persistent. Before the first real build, set:

- **Android SDK location** — install to e.g. `D:\UsuariosD\enfor\Android\Sdk`
  (Android Studio will ask on first run; point it there instead of the
  default `C:\Users\...\AppData\Local\Android\Sdk`).
- **`ANDROID_HOME`** / **`ANDROID_SDK_ROOT`** environment variables → the
  path above.
- **`GRADLE_USER_HOME`** environment variable → e.g.
  `D:\UsuariosD\enfor\.gradle` (default is `C:\Users\<you>\.gradle`, which
  DeepFreeze would wipe, forcing a full dependency re-download every reboot).
- **Android Studio's own config/caches** — its default config dir is also
  under `C:\Users\<you>\.android` / `AppData`; check Android Studio →
  Settings → Appearance & Behavior → System Settings → Android SDK, and
  Settings → Appearance & Behavior → Path Variables, and redirect what you
  can to `D:`. Some Studio-internal caches can't be relocated — that's fine,
  they're disposable; only the SDK, Gradle cache, and the keystore need to
  survive a reboot.

**The upload keystore** (`signing.keystore`, currently at
`D:\00_AI\Brenda\Google Play Store\PWA Builder\Brenda - Google Play package_07\`)
is already on `D:`, so it survives reboots, and a copy is backed up on a
separate device (confirmed 2026-09-27). Losing it blocks all future updates
to the app (verified against Play Console 2026-09-26: App signing key
`C3:4F:E7:29...`, Upload key `B3:F6:B1:2D...` — this is the real,
currently-active key, not a spare). If the keystore or its passwords ever
change, refresh the off-machine backup too.

## Building and releasing

1. Copy `android-shell/keystore.properties.example` → `keystore.properties`
   (same directory), fill in the real values (see the example file's
   comments for exactly what goes where).
2. Open `android-shell/` in Android Studio and let it sync. Versions were
   verified by a real build on 2026-09-27 (AGP 9.4.1, Gradle 9.6.0,
   compileSdk 37 — required by core-ktx 1.19+ — targetSdk 36). AGP 9 has
   Kotlin **built in**: never add the `org.jetbrains.kotlin.android` plugin
   or a `kotlinOptions` block (the build hard-fails); the JVM target follows
   `compileOptions`. Gradle auto-installs missing SDK platforms.
3. Build → Generate Signed Bundle/APK → Android App Bundle → `release` →
   upload the resulting `.aab` to Play Console's existing Closed Testing
   track, same as any update.
4. Confirm `versionCode` in `app/build.gradle.kts` is still higher than
   whatever's currently live before every release (check Play Console →
   Release → Closed testing → your track).

## OAuth — future note

Authentication today is Nick + PIN posted to our own server — no OAuth, so no
Custom Tab or Credential Manager work was needed for this shell. **If "Sign
in with Google" is ever added**, be aware Google blocks OAuth flows inside
embedded WebViews (`disallowed_useragent` error) — that future work will need
a Custom Tab (`androidx.browser`) or Android's Credential Manager API
instead, added specifically for that flow; the rest of the app can stay
exactly as it is in this shell.

## Testing

See the Phase 3 checklist delivered alongside this doc (chat history / PR
description) for the full device test matrix and `adb` verification
commands — screen timeout, power button lock, app switching, phone calls,
airplane mode, permission grant/deny, renderer crash recovery, session
persistence across force-close, and the browser regression checks across
desktop Chrome, iPhone Safari, and Android Chrome.
