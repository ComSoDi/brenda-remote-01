// android-shell/build.gradle.kts — root project. All version numbers below
// were the current stable releases as of Sept 2026 (AGP 9.4.1, which bundles
// Kotlin support built-in — no separate kotlin-android plugin since AGP 9.0)
// — first verified by a real build + device test on 2026-09-27 (see
// docs/ANDROID_SHELL.md → Building and releasing).
plugins {
    id("com.android.application") version "9.4.1" apply false
}
