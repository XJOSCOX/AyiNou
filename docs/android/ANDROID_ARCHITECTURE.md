# AyiNou Android architecture

The single Gradle app in `apps/android` builds separately from Next.js and Fastify. Hilt supplies app-scoped services. A ViewModel exposes lifecycle-aware state to Compose. Navigation Compose hosts the account and preferences screens.

| Area | Responsibility |
| --- | --- |
| `core/auth` | Auth and platform DTOs, encrypted session storage, serial refresh, MFA, standing, onboarding and sign-out |
| `core/preferences` | Independent DataStore for language and theme |
| `core/network` | Exact API origin, bounded health and account requests, connectivity state |
| `ui` | Native sign-in, session and onboarding forms, account shell and settings |
| `res` | Four locales, branding, theme, backup and network policy |

A2 replaces A1 demonstration routes with an authorized account shell. A3 will extend navigation to the real Dashboard and profile. Supabase Auth issues grants. Fastify and SQL determine access. Android does not read private platform tables. See [session management](A2_SESSION_MANAGEMENT.md).

Remote debug can check public health. Authenticated Render access and production variants remain unavailable. An explicit local debug configuration supports disposable Auth. See [development setup](ANDROID_DEVELOPMENT_SETUP.md).
