# A0 Render backend setup

## Scope

This is an owner-operated, read-only Android development API for existing AyiNou test accounts. It uses the existing Fastify application and hosted Supabase project. The web application and the coming-soon site at ayinou.com stay on their existing infrastructure. The Render service, domain and DNS changes are pending owner action.

## Data model and API

The deployment adds a Fastify runtime mode with no database migration or new HTTP route. The existing `GET /health` and `HEAD /health` perform a process-only check. They return no build revision, connection details or dependency state. The separate `GET /api/v1/status` requires a valid allowlisted session and the shared registration policy check. Use it for an authenticated dependency smoke test.

A positive list of existing route templates allows GET and HEAD for member profile, session list, Dashboard, feed, replies and their images, notifications, community, institution, project, event and poll reads. See [the exact route list](../../apps/api/src/services/render-development.ts). Preview and review query parameters are denied. All mutation methods, privileged workflows, activation routes, registration endpoints and unlisted routes are closed in this mode. Normal local development retains its existing route behavior.

## Permissions and audit

The API takes the account identity only from the existing verified Supabase bearer token and live session check. Token issuer, audience, role, expiry, session and enrolled MFA checks still apply. The server compares the verified Auth UUID against the environment allowlist. It checks the existing registration policy on each allowlisted request and returns a generic 503 if the policy permits registration, cannot be read, or has an unexpected shape. An alternate host cannot access member routes, even with a token or forwarded Host header. No new authorization role, audit event, or test account is created.

The project currently permits public registration. This was verified via a read-only catalog check. **Before deploying, the owner must close or disable registration using the existing Founder Registration settings.** Fastify cannot change the direct Supabase Auth signup policy. Existing sign-ins still use the existing Auth flow, MFA and session controls. Reopening registration disables protected Render API access. The existing project policies remain responsible for direct Auth, Storage and Data API requests.

## Privacy and lifecycle

API responses use private, no-store caching, no-referrer, frame denial, no-sniff and restrictive content and permissions policies. HTTPS responses carry HSTS for the API host. The browser CORS plugin is disabled in Render mode. Request logs contain only the server-generated request ID, method, route template and status. The API never logs credentials, tokens, request bodies or query strings. Existing account restrictions, privacy projections and participant visibility still apply. The Render API does not expose evidence or privacy exports, and this deployment makes no changes to retention, legal holds or exports.

Use the existing owner-designated test accounts only and enter their immutable Auth user UUIDs on Render. Do not use real-member credentials or add a Founder account unless the owner explicitly intends that account to test the ordinary read path. No privileged endpoints become available when an allowed member has Founder authority.

## Localization and accessibility

This backend-only change uses the existing structured error envelope with safe, locale-independent codes and request IDs. The existing web interface and its four locales are unaffected. Native clients can localize the standard 401, 403, 429 and 503 conditions later. A generic 503 also covers a closed development boundary caused by an open or unreachable registration policy.

## Reliability and recovery

Render terminates TLS and redirects public HTTP to HTTPS. Fastify trusts forwarded metadata only from the immediate trusted ingress peer. Configure the Render ingress CIDRs before first protected use. The documented private CIDRs below assume this Free Web Service receives traffic only from Render ingress, since the Free service does not accept inbound private-network traffic. Narrow them to the confirmed ingress range when available. Do not use outbound Render ranges, wildcard CIDRs, public client ranges or trust-all. Unknown peers cannot assert HTTPS through forwarded headers. The internal process probe is exempt from the host and HTTPS checks.

On the single instance, the process permits 60 protected attempts per IP per minute, 90 authenticated reads per allowed member per minute, 300 attempts per minute globally and 12 simultaneous protected requests. Existing endpoint-specific limits continue to apply. Upstream access requires a valid token, and denied or malformed requests do not reach the handler. Render mode sets a 16 KiB default body limit, rejects bodies on its read-only HTTP surface, limits the request URL to 2 KiB, and uses 10-second request, 18-second handler and 20-second connection timeouts. An orderly Render shutdown closes the listener. [Fastify server options](https://fastify.dev/docs/latest/Reference/Server/)

The process starts no task scheduler, migration, worker, recurring cleanup or operational workflow. The existing separately invoked cleanup scripts are outside the start command. Upload-triggered cleanup remains behind disabled mutation routes. Expired-session observation and bounded read counters retain their existing behavior. A read-only hosted check found no pg_cron catalog, no active C1 departments, no enabled C2 Impact settings and no active C3 or C4 stages, and zero rows across sampled C1–C4 fixture gates.

## Validation and CI

The API fixtures cover missing and invalid configuration, invalid and non-allowlisted tokens, alternate hosts and preview paths, privileged and registration routes, trusted proxy matching, and rate limits. The disposable Auth integration exercises refresh, MFA, revocation and signup denial. The clean release passed typecheck, lint, the routine test suite, dependency audit, legal checks, engineering standards and local production builds. The Auth integration passed against a fresh disposable Supabase, including rejection by the direct signup endpoint. Separate disposable databases passed both volunteer-profile C3 tests and both C4.2 and C4.3 Founder preparation cases. These reruns resolve the outstanding D1 cases. Both immediate-signup checks passed in a separate disposable stack. The 70-case Chromium smoke run passed 69 cases. Its only failure was a stale Founder badge locator, corrected to check the account header and verified in a fresh disposable rerun. See [Render API tests](../../apps/api/test/render-development.test.ts), [Auth integration](../../apps/web/e2e/render-development.spec.ts) and [D1 regression status](../dashboard/D1_MEMBER_DASHBOARD_IMPLEMENTATION_REPORT.md).

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
| `AYINOU_RENDER_PROXY_CIDRS` | `10.0.0.0/8,172.16.0.0/12,192.168.0.0/16` for the private-ingress assumption above |
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

The owner's exact test-account UUIDs, shared registration closure, Render ingress CIDR verification and the first hosted smoke test are pending. Render and DNS have not been changed. No hosted website or Android work is part of A0.
