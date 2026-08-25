# SECURITY.md — Unflatten Offline

## Network posture

No `android.permission.INTERNET`. Verified against the actual packaged
APK via `aapt dump badging` (not just the source manifest — see
`scripts/security_audit.sh` and `BUILD_REPORT.md` §5), for both the debug
and release builds. This is an OS-enforced boundary: without this
permission, the Android platform itself refuses to let the process open a
network socket.

## String-scan audit results (real scan of the built APK, not a source grep)

`scripts/security_audit.sh` unpacks the built APK and scans every DEX,
resource XML, and asset file for: `http://`, `https://`, `ws://`,
`wss://`, `Bearer`, `Authorization`, `API_KEY`, `telemetry`, `analytics`.

Zero hits for `Bearer`, `Authorization`, `API_KEY`, `ws://`, `wss://`
anywhere in the release APK.

Hits found for the others, each investigated per brief §35 ("investigate
every relevant hit") rather than blanket-ignored:

| Pattern | Where | Explanation |
|---|---|---|
| `http://` | Every compiled resource XML | `http://schemas.android.com/apk/res/android` — the standard Android resource-XML namespace URI. Present in essentially every Android app's compiled resources; not a network call. |
| `http://` | `classes.dex` | `http://ns.adobe.com/xap/1.0/` — the Adobe XMP metadata namespace URI, compiled into `androidx.exifinterface` (used by this app's own EXIF-orientation-aware image import) for parsing XMP metadata blocks in image files. Not a network call. |
| `http://` | resource XML | `http://www.w3.org/2000/svg` — the SVG XML namespace URI, compiled into vector-drawable inflation code. Not a network call. |
| `https://` | `classes.dex` | `https://goo.gle/compose-feedback`, `https://issuetracker.google.com/issues/...` — string literals inside Jetpack Compose's own internal debug-assertion failure messages (from Google's AndroidX library, not this app's code), shown only if a Compose-internal invariant fails, suggesting a URL a developer could manually visit to file a bug. Never dereferenced by this app; unreachable at runtime regardless since the app has no INTERNET permission. |
| `https://` | `classes.dex` | `https://youtrack.jetbrains.com/issue/KT-55980` — same pattern, inside Kotlin's reflection library's own internal error message. |
| `analytics` | `classes.dex` | A `.analytics` entry inside a compiled-in top-level-domain validation regex (used by a standard Android/AndroidX text-linking utility to recognize valid domain suffixes in strings) — not a call to any analytics service. |
| `telemetry` / `analytics` | `classes.dex` | This app's own `DeviceDiagnostics.kt` writes a JSON field literally named `telemetry_or_analytics_present` (value: `false`) into the local diagnostics export — i.e. the app declaring, in writing, that neither is present. |

## Permissions

Confirmed via `aapt dump badging` against the built APK: the only
`uses-permission` entry present is
`<package>.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`, auto-injected by the
Android Gradle Plugin for any app targeting API 33+ as a self-scoped
broadcast-receiver-export hardening measure. It grants no capability to
any other app and has no relationship to networking or data access. No
app code requested it explicitly.

## Signing

Release APK is signed with the standard AGP debug keystore
(`CN=Android Debug`, verified with `apksigner verify --print-certs`) — a
genuine signature, but a development one, not a production release key.
No production signing key exists anywhere in this repository or session
(brief §45: never embed a private key in a delivered source archive).

## Native code safety

Untrusted-input handling implemented and unit-tested (`native_host_tests`):
UF7P chunk CRC32 verification with per-chunk skip-on-corruption rather than
whole-file failure; bad-magic and truncated-file detection reported as
fatal errors rather than undefined behavior; all binary parsing
(`ByteReader`/`BigEndianReader`) bounds-checks every read and throws a
catchable exception on underrun rather than reading out of bounds.

**Not done in this session** (see `KNOWN_LIMITATIONS.md`): no
ASan/UBSan/leak-detection instrumented test run, no fuzzing harness for
the UF7P/PSD/PNG parsers. The parsers' bounds-checked-read design (every
`ByteReader`/`BigEndianReader` call validates length before reading) makes
adding a libFuzzer harness straightforward later; none was set up due to
time budget in this build, not because it's considered unnecessary.

## Physical device security posture

Not evaluated — no physical device or emulator was available in this
build's environment (see `DECISIONS.md`, `DEVICE_VALIDATION_CHECKLIST.md`).
