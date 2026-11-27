# A1 native Android foundation implementation report

## Scope

A1 reuses the Empty Activity project in `apps/android`. The module retains `com.ayinou.app`, minimum API 26, and compile and target SDK 37. The local version is `1.0-dev`. The application is an internal development preview. A2 remains a separate phase.

The implementation reviewed the web brand and D1 member Dashboard, Feed and navigation, the four existing locales, shared Fastify contracts, the Supabase session boundary, and the existing Founder-controlled platform gates.

## Data model and API

The mobile model keeps Kotlin network DTOs separate from connectivity and UI state. The only callable Retrofit route is the existing public `GET /health`. It is available through a deliberate Settings action. The Fastify structured error envelope is decoded locally and mapped to translated messages. API configuration separates emulator localhost, an explicit private IPv4 debug host, the Render development origin and the fixed reserved production origin. The production variant is disabled. A1 adds neither a server route nor a migration.

## Permissions and audit

Internet and network-state access support the core network layer. The app registers one exported launcher. The mobile shell grants no platform authority. Future account standing, role, verification, privacy, blocking, muting, consent and feature availability will use server grants and projections. No hosted writes were performed and no audit contract changed.

## Privacy and lifecycle

Ordinary settings use DataStore. Credential storage uses a Keystore-backed AES-GCM key and a no-backup atomic file. The caller can clear the encrypted store and its key. Backup and transfer rules are restrictive. No HTTP credential is acquired or attached. Body and header logging are absent. The client keeps no private platform data cache.

## Localization and accessibility

The application defaults to Haitian Creole with explicit French, English and Spanish options. Native resource files contain parallel keys. Language and light, dark or system theme persist independently. Native navigation is inset-aware and uses tabs, accessible control labels and predictable nested routes. Sample Feed and Dashboard contents are explicitly labeled as development previews.

## Reliability and recovery

Startup uses Android SplashScreen while local settings initialize. It makes no API call. A storage error falls back to defaults and offers feedback. The connectivity monitor drives the offline banner. Health reads have bounded timeouts and at most one eligible retry. Retrofit/coroutines support cancellation. Coil has a small proportional memory cache and its disk cache is disabled. The source imposes an exact API origin and disables redirects. Local IPv4 validation rejects non-numeric hostnames.

## Validation and CI

A clean local Gradle build succeeded. The local APK was installed and launched on the Pixel 10 Pro XL emulator running API 36. A separate remote-mode debug build produced a cleartext-denying policy, and the build rejected a non-IP local override. The shipped artifact is the local, emulator-configured debug build.

- Six JVM tests passed, including five A1 checks for environment separation, bounded retries, error mapping, unexpected formats, redirect rejection and cancellation. One test is the generated scaffold smoke check.
- Three Android instrumentation tests passed on the emulator, including two A1 scenarios covering navigation and back, all four locale selections, light, dark and system choices, activity recreation, Keystore encryption round-trip and runtime cleartext policy. The suite also passed on an emulator viewport reduced to 900 by 1650 pixels.
- The first device run exposed an older Espresso input API incompatibility. Updating Espresso and AndroidX JUnit restored the API 36 test runner. The second run exposed asynchronous locale-dialog and preference transitions. Resolving dialog labels before creating its window and synchronizing tests with visible state restored the preference scenarios.
- An emulator cold start took 2332 ms according to ADB. One post-launch memory sample reported 90,219 KiB PSS. The APK measures 14,243,300 bytes. These figures represent one emulator and a debug build.
- Android lint passed locally. Manual emulator checks observed the offline banner, visible Dashboard content after landscape rotation, and persistence of Spanish and dark mode across a full process restart. Test preferences and display settings were restored. Dedicated tablet testing, a physical device, representative scrolling benchmarks and release-size measurements were unavailable. The release variant is intentionally disabled.

## Documentation and operations

The installed Android Studio 2026.2.2 bundled JDK 25.0.4.1, Gradle 9.6.0 wrapper, AGP 9.5.3 and SDK 37 built the app. Gradle configuration and pinned dependencies are maintained in the generated wrapper and module version catalog. Pinning includes Retrofit 3.0.0, OkHttp 4.12.1, Hilt 2.60.1, lifecycle 2.9.4, Navigation Compose 2.9.6 and Compose BOM 2026.02.01. All checks were local.

- [Android development and APK installation](ANDROID_DEVELOPMENT_SETUP.md)
- [Architecture](ANDROID_ARCHITECTURE.md)
- [Security model](ANDROID_SECURITY_MODEL.md)
- [Design system](ANDROID_DESIGN_SYSTEM.md)
- [Android roadmap](ANDROID_ROADMAP.md)

The debug APK is `apps/android/app/build/outputs/apk/debug/app-debug.apk`. Build it from `apps/android` with `gradlew.bat :app:assembleDebug`. The APK and local machine or signing files are excluded from Git. No APK was distributed externally.

## Remaining blockers

A0 remains open. Render must confirm the trusted loopback ingress boundary and forwarded-header handling before authenticated mobile requests are permitted. Read-only checks confirmed Founder registration is closed, the individual and organization entry points are disabled, and direct Supabase Auth signup is disabled. C1–C4 configuration was left unchanged. No authenticated Render request, account operation or hosted mutation was made.

A2 requires separate authorization for the existing Supabase sign-in and refresh flow, MFA, session expiry, signup and onboarding policy behavior, and authenticated API checks. A1 intentionally has no real platform records or operational mutation interfaces. Physical-device results, production signing and Google Play deployment are out of scope for this verification.
