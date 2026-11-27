# A2 authentication security review

| Area | Implemented control |
| --- | --- |
| Origin and transport | Separate Auth and Fastify clients pin scheme, host and port and disable redirects. Disposable cleartext is limited to the emulator host bridge. Fixture input uses @example.test and issuer binding prevents forwarding other tokens. |
| Secret handling | The opted-in APK contains only a disposable publishable key. Source carries no passwords, MFA codes, hosted secrets or signing material. No interceptor logs headers or bodies. |
| Persistence | Android Keystore, AES-GCM, atomic ciphertext, no-backup storage and cloud and transfer exclusions. An unreadable record requires reauthentication. |
| Session continuity | Rotation checks subject and session and serializes writes. The app cancels authenticated work at sign-out. Fastify independently checks platform revocation and authorization. |
| MFA | Verified factor detection gates the private API reads. The upgraded grant must preserve subject and session and contain AAL2. |
| Registration and recovery | Android has no signup or recovery write. The registration notice covers both pathways. The available environment does not supply approved recovery delivery or published legal links. |
| Account standing | A read budget and the self-only SQL RPC protect the restriction response. A development 403 remains a separate denial. |
| Native surface | Only the launcher is exported. No deep links are registered. Sensitive form values use unsaved state. There are no analytics, cached records, background sync or offline mutations. |

Hosted authentication remains disabled on Android until A0 verification. Fastify and its data rules remain authoritative. [Supabase sessions](https://supabase.com/docs/guides/auth/sessions) · [Supabase MFA](https://supabase.com/docs/guides/auth/auth-mfa) · [Android Keystore](https://developer.android.com/privacy-and-security/keystore)
