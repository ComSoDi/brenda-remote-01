// android-shell/settings.gradle.kts
// Brenda Android WebView shell — replaces the PWABuilder-generated TWA.
// See docs/ANDROID_SHELL.md for architecture and the local dev workflow.

pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "brenda-android-shell"
include(":app")
