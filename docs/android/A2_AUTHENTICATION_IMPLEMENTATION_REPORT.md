# A2 Android authentication implementation report

## Scope

A2 replaces the Android development screens with native welcome, sign-in, TOTP, session recovery, account standing, required onboarding and a basic account shell. It removes the fictional feed, Dashboard, announcements, notifications, profiles and badges. The account shell shows only an authorized name, handle and personal verification indicator. Settings retain language, theme and connection checks. A3 Dashboard and member profiles are outside this phase.

## Data model and API

Supabase Auth supplies password sign-in, user and factor lookup, token rotation, TOTP challenge and verification, and local-scope logout. Fastify supplies self profile, member experience policy and verification status. Android uses the existing details PATCH for the four required onboarding steps. A new Fastify standing read delegates to the existing M2.2 self-only RPC and returns an active suspension or ban category. No table, migration, grant or API allowlist changed.

## Permissions and audit

Fastify checks signed identity, issuer, audience, role, session deadline and standing before private reads. The standing response exposes only the category to the session owner through the existing SQL RPC. Existing onboarding and restriction workflows own their mutation audit. Android has no Founder role assignment or protected workflow authority. The Render allowlist excludes the new route.

## Privacy and lifecycle

Keystore AES-GCM wraps the session in an atomic no-backup file. Profile form state, passwords and authenticator codes remain transient. Disposable authentication uses the emulator host bridge, a fixed isolated Supabase port and test addresses ending in @example.test. A0 blocks all authenticated mobile traffic to Render. This work changed no hosted data or production services.

## Localization and accessibility

Haitian Creole is the default. English, French and Spanish cover the new screens and errors. Forms use native keyboard types, autofill annotations, password visibility, accessible labels and a scrollable layout. Settings support system, light and dark appearance.

## Reliability and recovery

Startup restores and revalidates an encrypted session. Network and service errors show a recoverable state. A mutex serializes restore, rotation, MFA, onboarding and sign-out. Each eligible read can be repeated once after refresh. Onboarding submissions are never replayed automatically. An offline sign-out clears the local session and reports unconfirmed provider logout.

## Validation and CI

See [A2 authentication tests](A2_AUTHENTICATION_TESTS.md) for actual test results and coverage limitations. Routine checks use local Gradle, Fastify and an isolated emulator development stack.

## Documentation and operations

See [development setup](ANDROID_DEVELOPMENT_SETUP.md) for the APK and configuration, [session management](A2_SESSION_MANAGEMENT.md) for transitions, and [security review](A2_AUTHENTICATION_SECURITY_REVIEW.md) for controls. The default APK has no Auth configuration. Disposable authentication requires an explicit local build.

## Remaining blockers

A2 local development readiness is complete for the disposable configuration. Physical-device and manual screen-reader results remain unavailable. Authenticated remote readiness remains blocked until A0 resolves Render ingress trust and independently verifies authorized HTTPS reads. Hosted Auth, password recovery delivery and published legal content remain unverified for mobile. The existing web legal workflow owns consent and publication. Mobile displays their unavailable state and does not write acceptance. Release remains disabled.
