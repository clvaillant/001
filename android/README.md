# Android wrapper source (NOT BUILT, NOT VALIDATED)

**Status: `SPECIFIED_ONLY` scaffold. No APK was produced or tested in this delivery.** The build
environment used for this delivery has no Android SDK, no Gradle and no device or emulator, so
nothing here was compiled. Do not treat this folder as an installable app.

What is here:

- `www/index.html` - a byte-identical copy of `Living_World.html`, written by `tools/build.cjs`.
- `capacitor.config.json`, `package.json` - configuration for a Capacitor 6 WebView wrapper that
  serves that one file from inside the app (no network permission is needed by the game).

The game needs no wrapper to run on Android today: copy `Living_World.html` to the phone and open
it in Chrome (see the top-level README). The wrapper only adds an icon, full-screen and a stable
storage origin.

## To build it yourself (requires internet once, Android Studio / SDK 34, JDK 17, Node 18+)

    cd android
    npm install                 # fetches Capacitor (the only third-party code involved)
    npx cap add android         # generates the native project in android/android
    npm run sync                # rebuilds ../Living_World.html and copies it into the app
    npm run apk                 # -> android/android/app/build/outputs/apk/debug/app-debug.apk

After `npx cap add android`, remove `<uses-permission android:name="android.permission.INTERNET"/>`
from `android/app/src/main/AndroidManifest.xml` if you want the OS to enforce offline operation
(the WebView still loads its bundled files).

## Optional local language model (not included)

`LW.localAI.register({name, local:true, generate})` is the only integration point. A native build
could implement `generate` with an on-device runtime (for example llama.cpp behind a Capacitor
plugin) reading weights the user installed. No weights, runtime or plugin ship with this delivery,
and until one is registered the game shows scripted, labelled dialogue only.
