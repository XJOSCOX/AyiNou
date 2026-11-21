# Ayinou Cookie & Tracking Notice

**DRAFT — NOT APPROVED FOR PUBLICATION**

## 1. Scope

The following inventory reflects the reviewed application and installed Auth libraries. It is not a capture of future production traffic. [Approval required — identify operator, actual deployment, covered services, preference choices and contact.]

| Mechanism | Current name or pattern | Purpose and lifetime limits |
| --- | --- | --- |
| Supabase Auth SSR session | `sb-<auth-host-label>-auth-token` and SDK-managed chunks where applicable | Maintains a signed-in session and lets the server refresh required state. SDK cookie presence is distinct from current server-side session validity. Verify deployed flags and actual lifetime against sign-in, refresh and sign-out. |
| Auth flow verifier | SDK-managed `-code-verifier` and flow-specific variants of the Auth cookie key | Supports proof-key account flows where applicable. Confirm actual cookies after confirmation and recovery testing. Do not log values or reuse verification artifacts. |
| Language | `ayinou-locale` cookie and browser localStorage key | Remembers Haitian Creole, French, English or Spanish. The source sets the locale cookie lifetime to 31,536,000 seconds, path `/`, SameSite Lax and Secure for HTTPS writes. A signed-in account can also have a server-side preference. |
| Display theme | localStorage `ayinou-home-theme` | Persists the device's theme preference if storage is available. The code does not set a local expiry for this key. |
| Feed mode | localStorage `ayinou-feed-mode` | Remembers the preferred Feed view on the device. A tab can retain the selection in memory if local persistence fails. |
| Operational security | Server-side request metadata, quota records and provider logs where configured | Supports diagnosis, session checks and abuse prevention. This is distinct from device preference storage. Approved retention and vendor settings remain open. |

## 2. Choices and limits

A person can change preferences in the interface or remove site data in the browser. That can reset preferences or sign out a device. It does not erase server records or revoke every other session. Use the applicable account-security settings for session controls. Blocking necessary Auth state can prevent sign-in or recovery. Clear site data after use on a public or shared device when appropriate.

The checked-in product inventory did not identify an advertising or analytics integration. Cloudflare DNS management alone does not establish a production tracking configuration. Verify headers, Auth cookies, embedded content, vendor settings and third-party requests against the deployed build. [Approval required — final classification, duration and purpose of each technology, third-party disclosure and applicable consent rules. Decide whether to use a standalone notice after counsel's review.] [Privacy Policy](PRIVACY_POLICY_DRAFT.md)
