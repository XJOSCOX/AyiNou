# Android security model

The application requests Internet and network-state access. The only exported activity is the launcher. There are no deep links, broadcast entry points, analytics, advertising, Firebase or trackers.

Debug local HTTP uses only one explicit numeric private host in the Android network security policy. Gradle validates the input and the runtime origin check validates scheme, address and port. Remote debug and reserved production use the exact HTTPS host with the platform trust store. Redirect following is disabled. No live credentials are attached in A1. The production variant is disabled and will require a separately approved signing configuration and release checks.

Sensitive credentials use AES-256-GCM with randomized IVs, a non-exportable Android Keystore key and an atomic encrypted file in the Android no-backup directory. Credentials have a redacted string representation. The manifest disables backup. Cloud and device-transfer rules exclude ordinary data directories as defense in depth. Theme and language use separate DataStore keys. The application keeps no platform records in offline storage. [Android Keystore](https://developer.android.com/privacy-and-security/keystore) · [Network security configuration](https://developer.android.com/privacy-and-security/security-config) · [Android backup rules](https://developer.android.com/identity/data/autobackup)

No request logging interceptor emits headers or bodies. UI errors are localized categories with a constrained request reference when present. Connection timeout, read timeout, call timeout and the read retry budget bound individual checks.

A2 requires A0 ingress verification, approved existing-account authentication, short-lived session and refresh handling, MFA and revocation tests, and parity with server-side privacy and standing policies. Release signing material belongs in a separately authorized signing system. The repo carries no production keys or passwords.
