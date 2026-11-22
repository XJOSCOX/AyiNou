# S2C private administration routes

Choose **Platform administration** in the account menu to open `/s/{flowId}/admin`. The server issues an opaque locator after checking live Founder or Administrator authority and recent TOTP. The link is tied to the account and the exact initiating session. Reloading in that session works until expiry or revocation. Sharing the link with another account, or opening it in a different session of the same account, gives a generic 404.

The stable `/admin` route serves an entry screen for eligible administrators and a 404 for ordinary members and signed-out visitors. The server checks the private route before rendering administration. **Close private workspace** revokes that locator. Reopening later creates a different reference. Requests and errors have private no-store caching and no-referrer headers, and the navigation link does not prefetch the workspace.

The verification review workspace follows the same pattern at `/s/{flowId}/review`. Entry requires the independently assigned reviewer role. Its stable entry remains `/verification/review`. Ordinary settings, onboarding, F1 and F1.1 keep their existing routes.
