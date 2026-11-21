# Local Development and GitHub Workflow

**Policy:** One branch named `main`. No pull requests, no feature branches, no merge queue. The code is built and validated locally before pushing directly to GitHub.

## Initial Git setup (when a new local repository is created)

```bash
git init -b main
git add README.md ROADMAP.md docs/ apps/ packages/ package.json package-lock.json .gitignore .env.example
git commit -m "feat: initialize Ayinou web and API foundation"
git remote add origin <YOUR_AYINOU_GITHUB_REPO_URL>
git push -u origin main
```

Do not run these from an existing repository without first checking its current branch, remote and working-tree status. Add `origin` only when the owner has provided its exact URL. If no remote is configured, stop after the local commit and report that fact. Never force-push or overwrite remote history.

## Normal iteration

```bash
git status
git branch --show-current       # must be main
# implement a small, bounded change
npm run lint                    # after scripts exist
npm run typecheck
npm test
npm run build
git diff --check
git diff --stat
git add <reviewed-files>
git diff --cached
git commit -m "feat(profiles): add editable profile settings"
git push origin main
```

Use specific paths for staging instead of `git add .` when possible. Never force-push shared main. If a push is rejected because upstream changed, fetch and inspect history before integrating it locally; never overwrite remote changes.

## API refactoring checks

Run `npm run test -w @ayinou/api` for the Fastify injection tests. The route inventory fixture captures methods, paths, explicit body limits and route-local hooks, including implicit HEAD routes. Review each change to this fixture as an API contract change. The characterization cases also check response bodies, cache headers, error envelopes, request IDs and arguments sent to repositories.

Run `node --expose-gc --import tsx scripts/measure-fastify.mjs` in each clean revision to compare warm registration, loopback startup, representative injection latency, dependency call counts, and post-close heap. It uses synthetic repository and authentication adapters and requires no credentials. Hosted rollback suites and the local browser suite cover real authorization separately.

Run `npm run test:e2e -- --measure-polls` in a clean Phase 6F.6 checkout for the seeded poll comparison. It benchmarks both listing functions on the same disposable Docker database and exercises voting and finalization. Run `npm run test:hosted:polls:sql -- --scope-preflight` only on the intended linked project before applying the listing migration. It executes the migration and poll assertions inside a transaction that rolls back. The ordinary guarded poll SQL command checks the current hosted schema without applying migrations.

## Main branch checks

`Main checks` runs on direct pushes to `main`. Three jobs run workspace typecheck, lint and tests, an npm audit and both builds, and the Chromium smoke suite with isolated Docker Supabase. Each job uses Node 22.18.0 and `npm ci`. The build job fails on reported npm advisories at low severity or higher. The workflow uses SHA-pinned actions and a read-only repository token. Browser artifacts contain only result counts and expire after three days. The workflow uses no hosted credentials and performs no deployment or hosted migration.

Follow the pushed commit in the repository's Actions tab or run `gh run list --workflow main-checks.yml --branch main`. Use `gh run view <run-id> --log-failed` when a job fails. Reproduce the job locally with `npm run typecheck`, `npm run lint`, `npm test`, `npm audit --audit-level=low`, `npm run build`, or `npm run test:e2e:smoke`. Continue to run the full Chromium suite for locally validated releases.

The [final Phase 6F review](audits/PHASE_6F_FINAL_REVIEW.md) records the engineering gate and remaining launch work. A green Actions run establishes the push's automated checks. Hosted staffing, incident response, email delivery, privacy operations and restoration have separate evidence requirements.

## Browser regression tests

The suite in `apps/web/e2e/` uses Playwright Test **1.65.1** with Chromium and axe **4.14.0**. Use the repository's Node and npm versions and a running local Docker Engine. The phase baseline was verified on Node 22.18. Install dependencies with `npm ci` and Chromium with `npx playwright install chromium`. On a Linux test host that needs browser libraries, use `npx playwright install --with-deps chromium`.

```sh
npm run test:e2e
npm run test:e2e:smoke
npm run test:e2e:headed -- privacy.spec.ts
npm run test:e2e -- --grep "scheduled poll"
npm run test:e2e -- --list
npx playwright show-trace apps/web/e2e-results/<test-directory>/trace.zip
```

The runner starts its own Next.js and Fastify on 5400 and 5300. It copies the tracked Supabase configuration and migrations into a fresh workspace, enables TOTP in that local configuration, and starts a randomly named Docker project using ports 55320–55329 and inspector port 8183. Test commands require free ports and fail if setup is unavailable. Discovery with `--list` requires neither Docker nor credentials.

The runner also starts a second Fastify process on 5301 to test concurrent identical commands across processes. To run just the L3.2 coverage, use `npm run test:e2e -- privacy-intake.spec.ts`. The test harness enables synthetic API mode on loopback and adds only synthetic subjects to the disposable database allowlist. Keep `AYINOU_PRIVACY_INTAKE=disabled` on ordinary developer and production deployments. Review the exact hosted link and a migration dry-run before any schema rollout. Recovery is to disable the API or roll back its application release while keeping the inert additive schema in place pending reviewed remediation. [Privacy operating boundaries](privacy/L3_2_IMPLEMENTATION_REPORT.md)

Run `npm run test:e2e -- privacy-export.spec.ts` for L3.3. The disposable runner generates one random key per run for the two isolated API processes. The Next.js process receives no key, and CI needs no export secret. Keep `AYINOU_PRIVACY_EXPORT=disabled` outside the runner. An interrupted rollout can be recovered by disabling the API and verifying empty hosted gates; preserve migration history and leave the inert schema in place. [L3.3 operating limits](privacy/L3_3_IMPLEMENTATION_REPORT.md)

Run `npm run test:e2e -- privacy-lifecycle.spec.ts` for L3.4. Only the disposable runner enables lifecycle planning and seeds case-scoped fixture authority. Real deployments keep `AYINOU_PRIVACY_LIFECYCLE=disabled`. Review the migration dry-run and verify that the hosted fixture and planning tables are empty. Recovery is to disable the API and preserve the additive schema and audit history pending review. Never use this runner or its authority setup against hosted Supabase. [L3.4 operating limits](privacy/L3_4_IMPLEMENTATION_REPORT.md)

For L3.5 verification, use a clean copy of the committed candidate and keep unrelated workspace files out of the index. Run the full Chromium suite against disposable Supabase. Use a read-only transaction for hosted catalog evidence and publish only counts and redacted checks. Keep real privacy gates disabled. A provider-backed restore requires an independently approved plan and isolated projects. Verify the actual GitHub Actions outcome for the pushed SHA. [Security test matrix](privacy/PRIVACY_SECURITY_TEST_MATRIX.md) · [Restore rehearsal](privacy/RESTORE_REHEARSAL_RUNBOOK.md)

No user-supplied environment variables are needed. The runner uses credentials returned by the new local stack and checks its loopback origin before starting tests. Web and API service configuration is supplied from this run. Auth uses individually generated accounts under `example.invalid` and real password sessions. The test admin confirms those synthetic accounts without changing email confirmation settings. MFA tests enroll and verify a real TOTP factor. Fixture accounts are excluded from public metrics, and there is one browser worker. Application-level tests use normal browser or API calls. A few local fixtures use SQL to set exact timing or restriction state.

The runner stops its own project with `--no-backup`, checks for leftover project containers and volumes, and removes the generated workspace. Other local stacks and hosted Supabase are outside the runner. After a hard termination, use the exact `ayinou-e2e-…` project ID and generated `.e2e-run-…` path from that run with `npx supabase stop --no-backup --project-id <test-project> --workdir <test-directory>`. Use a trusted local machine because the Supabase CLI can publish container ports beyond loopback.

Failures keep screenshots, a trace, and the JSON report under the ignored `apps/web/e2e-results/` directory. Treat traces as sensitive because they can contain temporary sessions and fixture inputs. Review errors locally before sharing plain summaries. The suite complements Fastify and SQL checks. It covers Chromium, representative axe rules and layout widths, controlled session failures and browser timing. Screen-reader speech, zoom, other engines, genuine access-token and signed URL expiry, and hosted email delivery still require separate testing.

## Frontend refactoring checks

Read `apps/web/AGENTS.md` and the relevant installed Next.js documentation before changing App Router behavior. Keep route entries and shared UI in their existing directories. Use feature folders for forms, views, and hooks that belong to a single workflow. Preserve client boundaries, resource ownership, and existing public exports when extracting a feature.

Run translation parity and the affected Chromium specs for each batch. For example, run `npm run test:e2e -- project-progress.spec.ts` for milestone version conflicts, outcome rendering, request counts, and image disposal. The group spec uses a real TOTP session for invitations. The project work spec checks server-supplied contributor controls, and the onboarding and trust specs cover draft recovery and access denial.

Compare production artifacts from clean exports of both revisions using the same Node version, dependencies, and build command. Check the App Router manifest and the unique JavaScript chunks listed per route in the client reference manifests. Record browser timing separately from build size, including environment and sample size. Keep hosted authorization checks in the guarded rollback-only suites.

## Shared contract checks

Run `npm run test:shared` after a change to `packages/shared`. The check is included in `npm test`. It compiles the package with strict TypeScript, compares the public declaration inventory and runtime values, checks value identity and tuple ordering, and rejects ambiguous exports and circular dependencies. Run workspace typecheck as well to verify the package entry point from both apps.

The checked-in fixture comes from the Phase 6F.5 baseline. To inspect or reproduce the inventory, export the known revision to a separate directory and run `node --import tsx scripts/check-shared-contracts.mjs <export>/packages/shared --print`. Review any contract difference as an API change before updating the fixture. Run the affected API tests and locale checks alongside each extraction.

## Before every push

- [ ] On `main` with clean known history; no unrelated files
- [ ] No secret or personal data staged (`.env.local`, private keys, credentials, recordings, IDs)
- [ ] Tests, typecheck, lint, build pass
- [ ] Auth, RLS, moderation and privacy tests pass when relevant (future phases)
- [ ] Locale strings work in `ht`, `fr`, `en`, `es`
- [ ] Browser smoke passes for user-facing and authenticated workflow changes
- [ ] Hosted migration history and dry-run reviewed; isolated local pgTAP tests run when available
- [ ] Document changes and update roadmap checkbox status
- [ ] Review staged diff, then commit and push directly to `main`

## Commit naming examples

- `chore: initialize Next.js and local Supabase`
- `feat(i18n): add Haitian Creole French and English switcher`
- `feat(auth): add account onboarding`
- `test(rls): block private profile access`
- `fix(feed): enforce post visibility`
- `docs: complete phase 1 acceptance checklist`

## Releases

A GitHub push is not a deployment. Production hosting is postponed until explicit approval. Use Git tags for stable milestones if helpful; tags do not create branches or pull requests.
# Legal publication boundary (L6.1)

Committing a legal draft, passing translation tests, or building the site does not approve or publish it. Production release and evidence registries remain empty. Run `npm run test:legal-center` and `python scripts/validate-legal-l5.py` before any legal code change; CI enforces both. L6.2 requires separate owner, legal and publication decisions. See [L6.1 security model](legal/L6_1_PUBLICATION_SECURITY_MODEL.md).

L6.2A adds an administrator status and availability workspace. Its disabled database defaults and empty immutable registries reject activation. Review migration dry runs and disposable database/browser checks before hosted application. A future release requires separate written legal, translation, owner and publication decisions; the operational switch alone cannot publish. See [L6.2A controls](legal/L6_2A_ADMIN_PUBLICATION_CONTROLS.md).


## O2 organization signup intent

Use the disposable Chromium runner with its local mail catcher for O2 signup and confirmation tests. Review the migration dry-run against the linked project before applying it. Keep the future pilot eligibility rule shared across both signup choices. The O2 path is limited to intent and does not call the legacy institution write API. [Implementation report](organizations/O2_IMPLEMENTATION_REPORT.md)

## O3 founder identity release boundary

Exercise founder proof and grant only in the disposable Chromium suite. The hosted dry run must list O2 before O3 while both remain pending. Obtain explicit authorization for hosted application and verify the closed policy and empty authority/case tables after rollout. Deployment does not approve proof policy, authority provisioning, real issuance or O4 eligibility. [Release and recovery details](organizations/O3_IMPLEMENTATION_REPORT.md)

## O4 migration and deployment

The hosted release sequence is O2, O3, then O4 after separate authorization. Verify live identity rules, empty founder activation, legacy management roles, and the closed SQL create/claim routes before deploying the matching API and UI. Roll forward with the legacy guard in place to avoid opening creation during recovery. [O4 rollout](organizations/O4_IMPLEMENTATION_REPORT.md)


## O5 administrative corrections and governance

Verify the hosted O2 through O5 migration order read-only before any authorized rollout. Apply with separate production approval and deploy matching API and web. Recovery and high-impact execution remain closed. See [O5 operations](organizations/O5_IMPLEMENTATION_REPORT.md#documentation-and-operations).


## O6 Early Partners

Check hosted migration history and the O2 through O6 dry run before any approved rollout. Deploy matched applications after the database postflight. Real partner enrollment, publication and public visibility remain separately gated. See [O6 operations](organizations/O6_IMPLEMENTATION_REPORT.md#documentation-and-operations).
