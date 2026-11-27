# A2 Android authentication implementation report

## Scope

A2 replaces the Android development screens with native welcome, sign-in, TOTP, session recovery, account standing, required onboarding and a basic account shell. It removes the fictional feed, Dashboard, announcements, notifications, profiles and badges. The account shell shows only an authorized name, handle and personal verification indicator. Settings retain language, theme and connection checks. A3 Dashboard and member profiles are outside this phase.

## Data model and API

Supabase Auth supplies password sign-in, user and factor lookup, token rotation, TOTP challenge and verification, and local-scope logout. Fastify supplies self profile, member experience policy and verification status. Android uses the existing details PATCH for the four required onboarding steps. A new Fastify standing read delegates to the existing M2.2 self-only RPC and returns an active suspension or ban category. No table, migration, grant or API allowlist changed.

## Permissions and audit

Fastify checks signed identity, issuer, audience, role, session deadline and standing before private reads. The standing response exposes only the category to the session owner through the existing SQL RPC. Existing onboarding and restriction workflows own their mutation audit. Android has no Founder role assignment or protected workflow authority. The corrected Render allowlist includes this self-only read and excludes platform write and administrative routes.

## Privacy and lifecycle

Keystore AES-GCM wraps the session in an atomic no-backup file. Profile form state, passwords and authenticator codes remain transient. Disposable authentication uses the emulator host bridge, a fixed isolated Supabase port and test addresses ending in @example.test. A0 authorizes a separate HTTPS debug build for existing allowlisted test accounts. This app uses a separate application ID and storage sandbox, a fixed hosted Auth issuer, and a read-only platform client. It cannot edit onboarding. Existing application writes, registration and release remain closed.

## Localization and accessibility

Haitian Creole is the default. English, French and Spanish cover the new screens and errors. Forms use native keyboard types, autofill annotations, password visibility, accessible labels and a scrollable layout. Settings support system, light and dark appearance.

## Reliability and recovery

Startup restores and revalidates an encrypted session. Network and service errors show a recoverable state. A mutex serializes restore, rotation, MFA, onboarding and sign-out. Each eligible read can be repeated once after refresh. Onboarding submissions are never replayed automatically. An offline sign-out clears the local session and reports unconfirmed provider logout.

## Validation and CI

See [A2 authentication tests](A2_AUTHENTICATION_TESTS.md) for actual test results and coverage limitations. Routine checks use local Gradle, Fastify and an isolated emulator development stack.

## Documentation and operations

See [development setup](ANDROID_DEVELOPMENT_SETUP.md) for the APK and configuration, [session management](A2_SESSION_MANAGEMENT.md) for transitions, and [security review](A2_AUTHENTICATION_SECURITY_REVIEW.md) for controls. The default APK has no Auth configuration. Disposable authentication requires an explicit local build. The remote APK requires the hosted publishable key at build time and has its own application ID. The remotely verified APK and build command are recorded in the [A0 deployment report](../deployment/A0_RENDER_BACKEND_SETUP.md).

## Remote verification and remaining limitations

On the Pixel 10 Pro XL emulator running API 36, the owner signed in natively as Test02. Cold process restart restored the authorized member screen from the Keystore-encrypted no-backup file. A separate cold restart with expired local scheduling metadata triggered hosted provider refresh. Native sign-out removed the encrypted session file, and the refreshed token then received HTTP 401 from Render. The app checks issuer, subject and session continuity during refresh. The final local regression passed 19 JVM tests and three standard emulator tests. Three disposable Auth scenarios were skipped because this run did not supply a disposable Auth fixture. Both dedicated hosted Android verification checks passed.

Physical-device and manual screen-reader results remain unavailable. Password recovery delivery and published legal content remain unavailable in this mobile build. The existing web legal workflow owns consent and publication. Remote onboarding writes and production release remain disabled. A3 was outside this work.
