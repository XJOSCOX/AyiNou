# A2 authentication tests

The emulator was a Pixel 10 Pro XL AVD on API 36. The isolated stack used Supabase at 127.0.0.1:55321 and Fastify at 127.0.0.1:5300. Only disposable accounts and keys were used.

## Verified paths

- The emulator completed real Supabase password sign-in, opened the authorized shell, recreated the activity and signed out. A second account completed native TOTP and all four required onboarding screens. After a force-stop, a separate instrumentation process restored the encrypted completed session in 1,008 ms and signed out.
- Disposable GoTrue recovery reached the local mail catcher without using a hosted address or following the recovery link.
- Disposable direct signup and both platform registration pathways were closed. The four native onboarding payloads advanced a required account from step 0 through step 4. The suspended fixture could read only its restriction category through the standing route. Starting a GoTrue TOTP challenge and verifying it produced upgraded grants. Provider logout revoked standing access.
- Direct disposable signup was rejected. The loopback password grant took 78 ms. The Compose path from form interaction to the authorized shell took 1,595 ms in one run.
- All 67 Fastify tests and 17 JVM tests passed. Fastify typechecking, targeted lint, Android lint, the clean debug build and the staged engineering standards check passed.
- Three default-build instrumentation tests passed. The three disposable scenarios are skipped in the default build by design and passed in separate opted-in runs.
- MockWebServer covers invalid credentials, unconfirmed email, TOTP detection and confirmation, restoration, rotation, concurrent requests, forbidden and unauthorized responses, restriction routing, onboarding routing, provider logout failure, origin binding and redirect denial.
- Compose exercises settings navigation, four language choices, and light and dark preferences. Android Keystore instrumentation covers ciphertext and unreadable storage. The welcome screen and settings action were visible at a 320 dp viewport and 1.5× system font scale in portrait and landscape.

## Coverage limits

A2 has no physical-device result or manual screen-reader walkthrough. Compose semantics, keyboard input and narrow large-font layouts were checked on the emulator. A0 blocks authenticated Render use. Hosted recovery delivery and published legal acceptance remain unverified. The debug app presents their unavailable state.

## Request counts

Sign-in normally makes four requests. They are the password grant, user lookup, self profile and verification badge. Restoration with a valid stored grant normally makes three. A successful proactive refresh adds one. The disposable refresh request rotated the token in 21 ms. A cold debug startup measured 2,274 ms. Idle emulator PSS was 79,211 KiB and the default APK was 14,334,908 bytes. These single-run local figures do not establish hosted capacity or a physical-device baseline.
