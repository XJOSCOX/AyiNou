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

## Before every push

- [ ] On `main` with clean known history; no unrelated files
- [ ] No secret or personal data staged (`.env.local`, private keys, credentials, recordings, IDs)
- [ ] Tests, typecheck, lint, build pass
- [ ] Auth, RLS, moderation and privacy tests pass when relevant (future phases)
- [ ] Locale strings work in `ht`, `fr`, `en`
- [ ] Migrations tested against local database
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
