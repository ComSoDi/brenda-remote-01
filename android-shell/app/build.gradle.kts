// android-shell/app/build.gradle.kts
//
// Native Kotlin WebView shell for Brenda — replaces the PWABuilder TWA.
// Same applicationId, same upload key, so this ships as an update to the
// existing Closed Test rather than a new app (see docs/ANDROID_SHELL.md).

import java.util.Properties
import java.io.FileInputStream

plugins {
    id("com.android.application")
}

// Loaded from keystore.properties (gitignored) — see keystore.properties.example.
// Signing config is skipped (not an error) if the file is absent, so a
// contributor without the real keystore can still build+run the debug
// variant; only `release` actually needs it.
val keystorePropsFile = rootProject.file("keystore.properties")
val keystoreProps = Properties().apply {
    if (keystorePropsFile.exists()) {
        load(FileInputStream(keystorePropsFile))
    }
}

android {
    // Deliberately kept identical to the original PWABuilder TWA's package —
    // changing this creates a brand-new Play Store listing and restarts the
    // 14-day Closed Test clock. Confirmed against Play Console 2026-09-26.
    namespace = "co.aibrenda.twa"
    compileSdk = 37 // required by core-ktx 1.19+; runtime behavior still follows targetSdk

    defaultConfig {
        applicationId = "co.aibrenda.twa"
        minSdk = 26   // Android 8.0 — notification channels (needed for the
                      // foreground service notification either way) are
                      // mandatory from here, and it's a broad-enough floor
                      // for Brenda's senior-skewing but not device-ancient
                      // audience. Raise/lower after real device data if needed.
        targetSdk = 36 // Android 16 — required for new submissions/updates
                       // as of Aug 31, 2026 (confirmed live against
                       // developer.android.com 2026-09-26).

        // Current live Play Console release is versionCode 7 (versionName
        // 1.0.0.7, confirmed 2026-09-26). This build must exceed it.
        versionCode = 8
        versionName = "1.0.0.8"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        // Part F: BuildConfig field, never a hardcoded URL baked into shared
        // code, so a build accidentally pointed at a laptop can never ship.
        // Overridden per build type below.
        buildConfigField("String", "SERVER_BASE_URL", "\"https://aibrenda.co\"")
    }

    signingConfigs {
        create("release") {
            if (keystorePropsFile.exists()) {
                storeFile = file(keystoreProps["storeFile"] as String)
                storePassword = keystoreProps["storePassword"] as String
                keyAlias = keystoreProps["keyAlias"] as String
                keyPassword = keystoreProps["keyPassword"] as String
            }
            // else: left unconfigured. Attempting to assemble a *signed*
            // release build without keystore.properties present will fail
            // at the signing step with a clear Gradle error, not silently
            // produce an unsigned/wrongly-signed artifact.
        }
    }

    buildTypes {
        debug {
            // Local dev server per Part F (Phase 1 finding #10: port 3000).
            // 10.0.2.2 is the emulator's alias for the host machine's
            // localhost; a physical device instead uses `adb reverse
            // tcp:3000 tcp:3000` and connects to localhost:3000 directly —
            // see docs/ANDROID_SHELL.md for the full local workflow either way.
            buildConfigField("String", "SERVER_BASE_URL", "\"http://localhost:3000\"")
            isDebuggable = true
            applicationIdSuffix = null // deliberately NOT suffixed — same
                                       // applicationId in debug and release
                                       // so cookie/session behavior matches
                                       // production; isolation instead comes
                                       // from pointing at a different URL.
        }
        release {
            isMinifyEnabled = false // WebView shell has very little Kotlin
                                    // logic to obfuscate; not worth the added
                                    // build complexity/risk for v1.
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    // No kotlinOptions: AGP 9 built-in Kotlin derives jvmTarget from
    // compileOptions.targetCompatibility above.

    buildFeatures {
        buildConfig = true
        viewBinding = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.19.1")
    implementation("androidx.appcompat:appcompat:1.8.0")
    implementation("androidx.activity:activity-ktx:1.13.0")
    implementation("androidx.webkit:webkit:1.17.1") // WebViewCompat.addWebMessageListener,
                                                      // WebViewFeature — verify against
                                                      // Android Studio's suggested latest
                                                      // on first sync (see file header note)
    implementation("androidx.core:core-splashscreen:1.2.0")
    implementation("com.google.android.material:material:1.14.0")
    implementation("androidx.constraintlayout:constraintlayout:2.2.2")
}
