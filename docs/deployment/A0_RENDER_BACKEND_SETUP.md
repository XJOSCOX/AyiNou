# A0 Render backend setup

## Scope

This is an owner-operated, read-only Android development API for existing AyiNou test accounts. It uses the existing Fastify application and hosted Supabase project. The web application and the coming-soon site at ayinou.com stay on their existing infrastructure. The owner has deployed the Render service and configured the custom domain. The public health endpoint was independently verified. Member access remains blocked pending the findings below.

## Data model and API

The deployment configures the restricted Fastify runtime mode with zero database migrations. The existing `GET /health` and `HEAD /health` perform a process-only check. They return no build revision, connection details or dependency state. The separate `GET /api/v1/status` requires a valid allowlisted session and the shared registration policy check. Use it for an authenticated dependency smoke test.

A positive list of existing route templates allows GET and HEAD for member profile, self-only restricted account standing, session list, Dashboard, feed, replies and their images, notifications, community, institution, project, event and poll reads. See [the exact route list](../../apps/api/src/services/render-development.ts). Preview and review query parameters are denied. All mutation methods, privileged workflows, activation routes, registration endpoints and unlisted routes are closed in this mode. Normal local development retains its existing route behavior.

## Permissions and audit

The API takes the account identity only from the existing verified Supabase bearer token and live session check. Token issuer, audience, role, expiry, session and enrolled MFA checks still apply. The server compares the verified Auth UUID against the environment allowlist. It checks the existing registration policy on each allowlisted request and returns a generic 503 if the policy permits registration, cannot be read, or has an unexpected shape. An alternate host cannot access member routes, even with a token or forwarded Host header. No new authorization role, audit event, or test account is created.

Close the shared registration policy in Founder settings and disable new-user signups in the Supabase Auth configuration before admitting test accounts. Existing accounts continue to sign in. Fastify checks the Founder policy, and the shared Supabase Auth setting governs direct signup requests. [Supabase Auth configuration](https://supabase.com/docs/guides/auth/general-configuration)

## Privacy and lifecycle

API responses use private, no-store caching, no-referrer, frame denial, no-sniff and restrictive content and permissions policies. Responses whose HTTPS scheme is recognized carry HSTS for the API host. The browser CORS plugin is disabled in Render mode. Standard request logs contain only the server-generated request ID, method, route template and status. The API never logs credentials, tokens, request bodies or query strings. Existing account restrictions, privacy projections and participant visibility still apply. The Render API does not expose evidence or privacy exports, and this deployment makes no changes to retention, legal holds or exports.

Use the existing owner-designated test accounts only and enter their immutable Auth user UUIDs on Render. Do not use real-member credentials or add a Founder account unless the owner explicitly intends that account to test the ordinary read path. No privileged endpoints become available when an allowed member has Founder authority.

## Localization and accessibility

This backend-only change uses the existing structured error envelope with safe, locale-independent codes and request IDs. The existing web interface and its four locales are unaffected. Native clients can localize the standard 401, 403, 429 and 503 conditions later. A generic 503 also covers a closed development boundary caused by an open or unreachable registration policy.

## Reliability and recovery

Render Support confirmed that the Free instance receives requests from a Render-managed IPv4 loopback proxy, including after cold starts and restarts. External clients cannot reach the application listener directly, and Free Web Services do not receive private-network traffic. Only `127.0.0.0/8` is accepted, including its IPv4-mapped IPv6 representations. A single HTTPS scheme assertion is accepted from that peer. The actual `Host` must be `api-dev.ayinou.com`. Render forwards `X-Forwarded-Host` unchanged, so it has no authority. The exact health path on the custom host also accepts internal HTTP. [Render web services](https://render.com/docs/web-services) · [Render health-check Host behavior](https://render.com/docs/health-checks)

Render appends to `X-Forwarded-For` and recommends `CF-Connecting-IP`. The provider confirmation did not establish that the latter is overwritten or removed on every path reaching the custom host. Render mode uses one shared client quota of 60 protected attempts per minute. Both address headers are ignored for client identity under this fallback, including any missing, duplicated or malformed values. Distributed guest read budgets use a fixed bucket and endpoint member budgets use the verified account. The 90-read per-member, 300-attempt global and 12-in-flight limits remain configured. The shared client quota currently caps the total before the larger ceilings can be reached. Service activity can therefore reduce the free quota for other test clients. [Cloudflare client-IP header behavior](https://developers.cloudflare.com/fundamentals/reference/http-headers/)
Render mode sets a 16 KiB default body limit, rejects bodies on its read-only HTTP surface, limits the request URL to 2 KiB, and uses 10-second request, 18-second handler and 20-second connection timeouts. An orderly Render shutdown closes the listener. [Fastify server options](https://fastify.dev/docs/latest/Reference/Server/)

The process starts no task scheduler, migration, worker, recurring cleanup or operational workflow. The existing separately invoked cleanup scripts are outside the start command. Upload-triggered cleanup remains behind disabled mutation routes. Expired-session observation and bounded read counters retain their existing behavior. A read-only hosted check found no pg_cron catalog, no active C1 departments, no enabled C2 Impact settings and no active C3 or C4 stages, and zero rows across sampled C1–C4 fixture gates.

## Validation and CI

The API fixtures cover missing and invalid configuration, invalid and non-allowlisted tokens, alternate hosts and preview paths, privileged and registration routes, trusted proxy matching, and rate limits. The disposable Auth integration exercises refresh, MFA, revocation and signup denial. The clean release passed typecheck, lint, the routine test suite, dependency audit, legal checks, engineering standards and local production builds. The Auth integration passed against a fresh disposable Supabase, including rejection by the direct signup endpoint. Separate disposable databases passed both volunteer-profile C3 tests and both C4.2 and C4.3 Founder preparation cases. These reruns resolve the outstanding D1 cases. Both immediate-signup checks passed in a separate disposable stack. The 70-case Chromium smoke run passed 69 cases. Its only failure was a stale Founder badge locator, corrected to check the account header and verified in a fresh disposable rerun. See [Render API tests](../../apps/api/test/render-development.test.ts), [Auth integration](../../apps/web/e2e/render-development.spec.ts) and [D1 regression status](../dashboard/D1_MEMBER_DASHBOARD_IMPLEMENTATION_REPORT.md).

## Final remote verification

Verified on November 26, 2026. The owner reported deploying `da2df9235b5fede141743d6f9def208c28a7bba6`. The custom host was independently reachable and its CNAME resolved to `ayinou-api-dev.onrender.com`. The default hostname returned 404 for `/health`. The Render dashboard required sign-in, so the deploy record, actual service environment and resource metrics could not be inspected independently.

**Result: blocked.** The remote API is serving its public health probe. Secure use by Test02 has not been established.

| Check | Result |
| --- | --- |
| Shared registration and direct Auth | The hosted policy reports `enabled=true` and `mode=public`, with individual and organization signup enabled. The signup trigger on `auth.users` is enabled and the hosted bootstrap already exists. The read-only Supabase `/auth/v1/settings` endpoint returned `disable_signup=false` and email Auth enabled. No signup was attempted. |
| HTTPS at the edge | TLS certificate validation succeeded for `api-dev.ayinou.com`. HTTP `/health` redirected with 301 to the HTTPS URL and HTTPS `/health` returned 200. |
| Security response headers | Observed `Cache-Control: private, no-store`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, restrictive CSP and Permissions Policy. `Strict-Transport-Security` was absent on the sampled HTTPS health and protected responses. |
| Trusted ingress and protected reads | Over both HTTP/1.1 and HTTP/2, `GET /api/v1/status` returned `403 FORBIDDEN` with `HTTPS required`. Unauthenticated profile, Dashboard, Feed, Communities, Organization accounts, Projects and Events reads returned 403. The deployed code checks the derived HTTPS scheme before token validation. This observation differs from the owner's earlier anonymous 401. It is consistent with the trust configuration or forwarded scheme failing for the observed requests. The configured CIDRs, immediate peer and proxy header behavior remain unconfirmed. |
| Authenticated Test02, non-allowlisted account, missing, expired and invalid tokens | No authenticated remote check was possible with the two deployment blockers, and no live credential was sent. Missing and malformed bearer samples reached the same HTTPS guard and returned 403. This did not establish the expected token-layer 401 or non-allowlisted 403. A genuinely expired hosted token was not exercised. |
| Write, registration, admin and activation routes | Anonymous, empty PATCH requests to member profile and Dashboard preferences returned 404. Registration policy, admin overview, Founder bootstrap, Community Needs Pilot, Impact settings, Volunteer activation and Opportunity activation reads each returned 404. Privileged-token denial and the authenticated mutation boundary could not be independently sampled. |
| C1–C4 operational gates | Read-only queries on `hcbxulyfmdmuyccgrujs` found zero active Community Needs configurations, enabled Impact settings, active Volunteer stages and active Opportunity stages. All 19 checked C1–C4 fixture tables were empty. |
| Android contract | Existing-account sign-in and token refresh go to Supabase. The bearer JWT goes to the HTTPS Fastify API. Enrolled MFA, live-session checks and application role checks still apply. The disposable integration previously verified fresh and refreshed tokens, MFA, revocation and non-allowlisted denial. Hosted sign-in and refresh followed by successful remote reads remain unverified. |

### Remote response timings

Fresh HTTPS connections from one desktop network. Each warm sample includes connection establishment, TLS, and HTTP response time. The first observed health request took 274 ms total and 274 ms to first byte. Its server startup state was unknown. The warm denial series measures the ingress guard response and cannot estimate authenticated member processing.

| Request | Samples | Min | Median | Max |
| --- | ---: | ---: | ---: | ---: |
| GET `/health` (200) | 8 | 107 ms | 124 ms | 213 ms |
| GET `/api/v1/status` (403) | 8 | 106 ms | 122 ms | 208 ms |

No confirmed asleep-to-ready request or corresponding startup log was available, so genuine cold-start latency remains unmeasured. Actual Render CPU and memory require access to the service Metrics page. The 113 MiB peak and 8.2-second startup recorded in this guide came from the earlier local Linux rehearsal. [Render Free behavior](https://render.com/docs/free) · [Render service metrics](https://render.com/docs/service-metrics)

## A0.1 HTTPS correction and verification

A1 registration recheck on November 26, 2026 confirmed the Founder policy is disabled and closed, both signup pathways are disabled, and direct Supabase Auth reports `disable_signup=true`. The checks were read-only. A0 remains open pending provider confirmation of Render ingress and authenticated remote verification.


On November 26, 2026, the owner’s changes were verified read-only. The Founder policy is disabled and closed, both signup pathways are disabled, and the direct Supabase Auth settings endpoint reports `disable_signup=true`. Existing accounts remain the only eligible sign-in path. The currently deployed public `/health` returns 200. Anonymous HTTPS `/api/v1/status` still returned `403 HTTPS required` without HSTS.

In the deployed guard, an anonymous 401 means HTTPS recognition succeeded and the request reached the bearer-token check. `403 HTTPS required` occurs earlier. The reported 401 and the later 403 therefore passed different transport checks. Public DNS and TLS results cannot show whether the service accepted the immediate peer or what the last forwarded scheme was. The difference between those requests remains unexplained until their Render-side conditions can be compared.

Fastify checks the actual socket peer at hop zero, then uses the last `X-Forwarded-Proto` value. Its proxy address walk starts at that same socket peer and stops before trusting a second hop, even when that address also matches a configured range. Local Node tests confirmed IPv4 and IPv4-mapped IPv6 matching, including equivalent hexadecimal forms. A local regression reproduced 403 and missing HSTS when a trusted peer supplied the legal scheme `HTTPS`. A0.1 compares the case-normalized Fastify scheme for both HTTPS enforcement and HSTS. This fixes the reproduced casing defect. The live cause has yet to be confirmed.

Render documents TLS termination at the load balancer and HTTP from the load balancer to the service. Its public guidance does not establish the exact immediate peer CIDRs for this service or guarantee how the deployed path handles an incoming forwarded scheme list. Obtain written confirmation for `ayinou-api-dev`, covering stable immediate peer ranges, whether each forwarded header is replaced or appended, and which entry Render vouches for. Compare that answer with privately observed requests. Render’s outbound ranges and Cloudflare public edge IPs are different boundaries. [Render Web Services](https://render.com/docs/web-services) · [Render proxy guidance](https://render.com/articles/fastapi-production-best-practices) · [Fastify Request](https://fastify.dev/docs/latest/Reference/Request/)

Local API typecheck, lint and all six focused tests passed. Disposable Supabase accepted refreshed sessions for status, profile, Dashboard and Feed and preserved non-allowlisted denial, MFA, revocation and direct signup denial. The live C1–C4 operational settings still returned zero active rows in read-only checks.

### Live deployment and probe result

The Render dashboard showed A0.1 deployment `e62fe789bc8d46f3d2e5b7d323f08fe49f27464f` live in Virginia. The deployed process passed `/health`. A keyed request to the public HTTPS status route returned 403 with `HTTPS required` and no HSTS. Its matching private event recorded an IPv4 loopback socket peer that did not match the configured trust list. Fastify reported `http` even though the one forwarded protocol entry was lowercase `https`. The event counted three forwarded-address entries without recording their values. This confirms a peer trust mismatch for the sampled 403. The earlier owner-observed 401 lacks a matching private event and cannot be attributed to a particular peer or proxy path.

The probe environment key was removed after sampling and the same revision was redeployed with the other service settings preserved. Render marked the cleanup deployment live. After cleanup, health returned 200, protected status returned 403 without HSTS, and an empty profile PATCH plus admin overview, Volunteer activation and Opportunity activation reads returned 404. At that time the CIDR list was held pending Render confirmation of the immediate peer and its forwarded-header behavior. A single observed loopback peer establishes the failing request’s cause. It does not establish the service-wide trust boundary. Test02, the non-allowlisted account and the live token checks remain pending. No test-account credentials were sent.

### A0 Final correction and manual deployment

The earlier private-network trust setting excluded Render's immediate loopback, so Fastify rejected HTTPS before bearer validation. At the A0 Final baseline, the currently deployed service returned 200 on HTTPS health and 401 on anonymous status, both with HSTS. HTTP health redirected with 301 and the default Render hostname returned 404. Those public results precede deployment of the reviewed correction. The temporary ingress probe has been removed from the corrected source and its environment key is obsolete.

Set `AYINOU_RENDER_PROXY_CIDRS=127.0.0.0/8` in the existing service configuration and manually deploy the reviewed A0 Final commit while Auto-Deploy is disabled. A paid instance requires a new ingress and proxy security review before changing the instance type or its proxy settings.

The self-only account-standing route now participates in the existing Render allowlist. The handler returns only an active suspension or ban category through the existing notice RPC. A live restricted session must have a signed actor on the Render account allowlist and satisfy MFA requirements. The SQL contract rejects revoked or expired sessions. A successful standing check grants no access to ordinary member reads, writes or administrative routes.

A read-only A0 Final check confirmed the Founder policy is disabled and closed, both signup pathways are disabled, and the Supabase Auth settings report direct signup disabled. Counts were zero for active Community Needs departments, enabled Impact settings, active Volunteer and Opportunity stages, and the 19 sampled fixture tables.

The public baseline returned 401 for anonymous profile, Dashboard, Feed, Communities, Organization accounts, Projects and Events. These responses took 108–235 ms in a single warm sample. Standing, registration, admin and sampled activation paths returned 404 on that running release. The timings exclude authenticated and cold-start behavior.

The clean staged source passed API typecheck, targeted lint, the API build and all 68 API tests. The disposable Supabase integration verified behavior for allowed, non-allowlisted, restricted and revoked sessions, token refresh, MFA, HSTS and direct signup denial.

Hosted authenticated verification and the separate remote Android debug build are pending manual deployment and post-deployment checks. Treat the client-IP header as unverified until controlled evidence establishes sanitization on every ingress path. Record Test02 and non-allowlisted account results, refresh and revocation, all approved read routes, disabled writes and activation routes, response timings and available Render metrics after the owner deploys the reviewed release.

## Documentation and operations

### Render service

| Setting | Value |
| --- | --- |
| Service type | Web Service |
| Service name | `ayinou-api-dev` |
| Repository and branch | `XJOSCOX/AyiNou` on `main` |
| Runtime | Native Node.js |
| Node version | `22.23.5` |
| Region | Ohio. The linked Supabase pooler identifies AWS `us-east-2`. |
| Instance | Free, one instance, 512 MB RAM and 0.1 CPU |
| Root directory | Repository root. Leave the Render field blank. |
| Auto-Deploy | Off. Deploy a specific reviewed commit manually. |
| Build command | `npm ci --include=dev --workspace @ayinou/api --workspace @ayinou/shared --include-workspace-root=false && npm run build --workspace @ayinou/api` |
| Start command | `node --max-old-space-size=256 apps/api/dist/server.js` |
| Health check | `/health` |
| Custom domain | `api-dev.ayinou.com` |

The root workspace lockfile is required. The build installs the API and shared workspaces only. The shared package exports TypeScript sources that tsup bundles. Fastify also bundles the existing static legal publication manifest under `apps/web/src/lib/legal/published-releases.json` as build data. The build installs no Next.js workspace dependencies and starts no Next.js process. [Render monorepo root](https://render.com/docs/monorepo-support) · [Node versions](https://render.com/docs/node-version) · [Node 22 releases](https://nodejs.org/en/download/archive/v22) · [Regions](https://render.com/docs/regions) · [Compute plans](https://render.com/docs/compute-plans)

### Render settings and credentials

| Variable | Value |
| --- | --- |
| `NODE_VERSION` | `22.23.5` |
| `SKIP_INSTALL_DEPS` | `true` |
| `AYINOU_API_MODE` | `render-dev` |
| `NODE_ENV` | `production`, supplied by Render at runtime |
| `PORT` | `10000`, supplied by Render unless overridden |
| `LOG_LEVEL` | `info` |
| `SUPABASE_URL` | `https://hcbxulyfmdmuyccgrujs.supabase.co` |
| `AYINOU_RENDER_PROXY_CIDRS` | `127.0.0.0/8`, the exact Free instance ingress range confirmed by Render Support. |
| `AYINOU_RENDER_TEST_USER_IDS` | Comma-separated Auth UUIDs for up to ten approved test accounts. Enter privately in the service environment. |
| `SUPABASE_PUBLISHABLE_KEY` | Copy the publishable key for this exact project into the service environment. |
| `SUPABASE_SECRET_KEY` | Copy a server-only secret/service-role key for this exact project into the service environment. Never place it in an app or browser. |

Leave `API_HOST`, `API_PORT` and `WEB_ORIGINS` unset on Render. Render mode binds `0.0.0.0` to its runtime port. Unset the C1–C4 and synthetic privacy switches to use disabled defaults, or explicitly set them to `disabled`. Leave `AYINOU_FOUNDER_BOOTSTRAP_ENABLED` unset or set it to `false`. Leave `AYINOU_COMMUNITY_NEEDS_RELEASE` and `AYINOU_PRIVACY_EXPORT_TEST_KEY` unset. Copy values directly in the Render Dashboard. No database connection string is needed. Keep keys and test account UUIDs out of Git, logs and screenshots. [Render environment variables](https://render.com/docs/environment-variables)

For a future Android client, keep the Supabase URL and publishable key in client configuration. Use direct Supabase sign-in with existing accounts and store refresh credentials using platform-protected storage. Send the short-lived access token to Fastify as a bearer token, refresh through Supabase with one refresh in flight, and retry a read once using the fresh token. Enrolled accounts must complete their existing MFA challenge. A refresh does not override revocation or absolute session limits. A persistent 401 requires sign-in or MFA. A 403 means the account or route is ineligible and should not trigger a refresh loop. The native client should call the API only over HTTPS, use only sign-in flows, and avoid direct Data API access as an API fallback. Existing browser authentication and redirect configuration remain unchanged. [Supabase Android configuration](https://supabase.com/docs/guides/getting-started/quickstarts/kotlin) · [Supabase sessions](https://supabase.com/docs/guides/auth/sessions) · [Supabase MFA](https://supabase.com/docs/guides/auth/auth-mfa)

### Cloudflare and first verification

1. Create the Render service manually after closing shared registration. Use the settings above and deploy the reviewed `main` commit. Confirm Render reports a healthy process.
2. Add only `api-dev.ayinou.com` under Render Custom Domains. In Cloudflare add a **DNS only** CNAME named `api-dev` pointing to the exact service subdomain assigned by Render. Remove a conflicting record only for `api-dev` if one exists. Keep the apex, `www`, and existing Cloudflare SSL settings for ayinou.com as they are.
3. Verify the domain in Render and wait for its managed TLS certificate. Keep this development record DNS only. Disable the Render subdomain once the custom domain works. Run the checks below before giving the URL to testers. [Render Cloudflare setup](https://render.com/docs/configure-cloudflare-dns) · [Custom domain and subdomain settings](https://render.com/docs/custom-domains)

```sh
curl -fsS https://api-dev.ayinou.com/health
curl -sS -o /dev/null -w '%{http_code}\n' https://api-dev.ayinou.com/api/v1/status
curl -sS -o /dev/null -w '%{http_code}\n' https://api-dev.ayinou.com/api/v1/registration/policy
curl -sS -o /dev/null -w '%{http_code}\n' https://api-dev.ayinou.com/api/v1/admin/overview
```

Expected results are healthy JSON, then 401, 404 and 404. The raw HTTP URL should redirect at the edge. Verify an allowlisted live access token returns 200 from the status and own profile endpoints. Verify a valid non-allowlisted token returns 403, and expired or revoked tokens return 401. Enter tokens through a hidden local prompt in Bash and pass them to curl over standard input to avoid putting them in shell history or process arguments.

```sh
read -rs -p 'Test access token: ' token; printf '\n'
printf 'header = "Authorization: Bearer %s"\n' "$token" |
  curl --config - -sS -o /dev/null -w '%{http_code}\n' https://api-dev.ayinou.com/api/v1/me/profile
unset token
```

For resource expectations, use a single process under a 256 MiB V8 old-space cap. The free plan has 512 MB total and 0.1 CPU. Cold starts can take about a minute after 15 minutes of inactivity. A local Node 22.23.5 Linux rehearsal with a 512 MiB cgroup and 0.1 CPU reached health in 8.2 seconds, used 113 MiB peak API resident memory, and passed 121 health probes plus the unauthenticated, registration and alternate-host checks. The rehearsal used fixture credentials and loopback. It measures process startup and low-volume overhead. Supabase latency, response sizes and peak authenticated workload on Render still need a hosted smoke test. Check actual Render CPU, memory and error rates during the first allowed low-volume smoke test. [Render free tier limits](https://render.com/docs/free)

### Rollback

Suspend the Render service if access controls or verification are unexpected. If a previously verified release exists, select it in Render Deploys and roll back to that release with Auto-Deploy off. Confirm its environment and its same restrictive route, registration and account boundary. If this is the first release, keep it suspended until a corrected release passes. Revoke any development sessions or rotate keys if they were exposed. Rollback requires no database migration or website change. [Render manual deploys](https://render.com/docs/deploys) · [Render rollbacks](https://render.com/docs/rollbacks)

## Remaining blockers

The owner must manually deploy the corrected commit with the confirmed Free ingress range. Verify HTTP redirection, HTTPS 401 and HSTS on the corrected revision before authenticated reads. Complete the remote Test02 and non-allowlisted checks, including a refreshed session, expired and revoked sessions, and the standing endpoint's scope. Document the unauthenticated client-IP provenance check and retain the shared quota if it stays inconclusive. Remote mobile authentication and a separate debug APK follow those checks. A0 stays open until Test02 can securely use the remote API.
