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

No user-supplied environment variables are needed. The runner uses credentials returned by the new local stack and checks its loopback origin before starting tests. Web and API service configuration is supplied from this run. Auth uses individually generated accounts under `example.invalid` and real password sessions. The test admin confirms those synthetic accounts without changing email confirmation settings. MFA tests enroll and verify a real TOTP factor. Fixture accounts are excluded from public metrics, and there is one browser worker. Application-level tests use normal browser or API calls. A few local fixtures use SQL to set exact timing or restriction state.

The runner stops its own project with `--no-backup`, checks for leftover project containers and volumes, and removes the generated workspace. Other local stacks and hosted Supabase are outside the runner. After a hard termination, use the exact `ayinou-e2e-…` project ID and generated `.e2e-run-…` path from that run with `npx supabase stop --no-backup --project-id <test-project> --workdir <test-directory>`. Use a trusted local machine because the Supabase CLI can publish container ports beyond loopback.

Failures keep screenshots, a trace, and the JSON report under the ignored `apps/web/e2e-results/` directory. Treat traces as sensitive because they can contain temporary sessions and fixture inputs. Review errors locally before sharing plain summaries. The suite complements Fastify and SQL checks. It covers Chromium, representative axe rules and layout widths, controlled session failures and browser timing. Screen-reader speech, zoom, other engines, genuine access-token and signed URL expiry, and hosted email delivery still require separate testing.

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
