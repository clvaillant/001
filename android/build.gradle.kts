// Root build file. Plugins are declared here (with apply false) and applied
// in module build files, following the standard Android Gradle Plugin
// version-catalog-free convention (kept simple deliberately: this is a
// single-module app, a version catalog would be overhead, not value).
plugins {
    id("com.android.application") version "8.7.3" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.0.21" apply false
}

tasks.register("clean", Delete::class) {
    delete(rootProject.layout.buildDirectory)
}
