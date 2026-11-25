# C1 final end-to-end and local validation

## Same case across all ten departments

Each department ran the same native API and browser lifecycle on disposable Supabase. A member created and submitted a private need, a scoped triager referred it, an independent reviewer requested clarification, the author corrected it, and the reviewer made a supported finding. The author requested a privacy-safe publication and a different assigned reviewer approved it. A member read and discussed the snapshot in the department room. An organizer created a proposal, requested a link, received author consent and obtained an independent link decision. Allowed viewers saw the link in both directions. The workflow checked membership loss, cross-department denial including a mismatched room path for a member of both rooms, withdrawal, unpublication, invalidation and retained history.

The ten successful department cases are Artibonite, Centre, Grand’Anse, Nippes, Nord, Nord-Est, Nord-Ouest, Ouest, Sud and Sud-Est. The nationwide test route uses disposable fixtures. Live activation remains Ouest-only and disabled.

## Commands and coverage

- `npm test` ran shared contracts, translation parity, seven client-error/retry tests, 57 API tests and two web environment tests.
- `npm run typecheck`, `npm run lint`, and `npm run test:standards` passed. Standards includes five executable validator tests.
- `npm run test:e2e -- community-needs.spec.ts community-needs-review.spec.ts community-need-publication.spec.ts need-project-links.spec.ts pilot-community-needs.spec.ts community-room.spec.ts project-work.spec.ts moderation-center.spec.ts moderation-policy.spec.ts enforcement-appeals.spec.ts privacy-intake.spec.ts privacy-export.spec.ts privacy-lifecycle.spec.ts legal-admin.spec.ts account-enforcement.spec.ts feature-enforcement.spec.ts --workers=1` exercises the serial combined disposable run. The final combined run passed all 33 Playwright cases and 49 pgTAP assertions (33 Phase 1A, nine C1.1, seven C1.5) through the guarded disposable SQL helper.
- Both `npm run build` with synthetic non-loopback HTTPS origins and `npm run build:local` against the existing local configuration passed. Routine validation ran locally.
- The publication directory regression checks race isolation, keyboard Tab focus and a scoped axe WCAG A/AA scan. Author status, publication and Founder browser sweeps cover four locales and narrow displays. The added assigned-reviewer workspace check uses a separate signed-in context at 390 pixels. Actual hosted-account checks used the connected local app with live cases disabled.

## Failures diagnosed during validation

The existing shared Administrator fixture dependency and the obsolete Phase 1A session fixture were corrected. An early sample run omitted the required area field in the nationwide synthetic test data. A focused role-browser test later navigated before the sign-in redirect completed. Both are test fixture issues, with no production change. The final combined rerun finished with 33 passed and no failures or skips in the selected suites. A later focused run of the expanded reviewer test and the deletion-plan precondition also passed both cases in fresh disposable Supabase. Use `npm run test:e2e -- community-needs-review.spec.ts privacy-lifecycle.spec.ts --workers=1 --grep "reviews, corrections|deletion plans"` to reproduce that run.
