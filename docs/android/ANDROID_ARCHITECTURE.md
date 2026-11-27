# AyiNou Android architecture

A1 reuses the Android Studio Empty Activity scaffold in `apps/android`. Its single Gradle module builds independently of Next.js and Fastify. App startup and the Activity compose the UI. Hilt builds the app-scoped graph. The ViewModel combines ordinary preferences and connectivity into immutable StateFlow state. Compose observes it with lifecycle-aware collection and sends user intents back to the ViewModel.

| Area | Responsibility |
| --- | --- |
| `core/auth` | Session states, sign-out and revocation contracts, token and refresh seams, and an encrypted credential store |
| `core/preferences` | Separate DataStore for language and theme |
| `core/network` | Exact API origin, Retrofit DTOs and Fastify errors, bounded health reads, connectivity state |
| `ui` | Compose screens, route registry, reusable controls, previews and startup state |
| `res` | Native locale resources, brand assets, and backup and network policy |

Navigation Compose restores tab stacks and saved search input. Secondary routes use the same domain names as the existing web navigation. Dashboard follows the member D1 presentation. Feed presents a labeled local post illustration. Signup, session acquisition, token refresh, and server-backed feature navigation begin with separately authorized work.

Fastify remains the resource authority. Review the shared [core API](../../packages/shared/src/core.ts), [profile and membership](../../packages/shared/src/accounts.ts) and [account enforcement](../../packages/shared/src/account-enforcement.ts) contracts before mapping live models. Future member, organization and Founder Verified indicators must use their existing projections. Account standing, blocking, muting, privacy, consent, participation rules and C1–C4 availability come from server responses. The client should reflect denials and gate state returned by the API. The app uses the existing Supabase project through its future publishable-client Auth flow and Fastify for platform resources.

The sole implemented network operation is an explicit health check. Retrofit handles cancellation when its calling scope ends. A single eligible retry follows a short delay or a bounded Retry-After seconds value. Larger or non-numeric Retry-After values defer to the user. Production redirect and origin rules remain strict. No background workers, database cache, or offline mutation queue are required.
