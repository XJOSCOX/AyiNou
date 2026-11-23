# F2.2 — Feed experience and conversations

## Scope

F2.2 refines the existing Feed, composer, comments, and post image gallery. Post cards now identify organization handles and link repost attribution to the reposting member. Discussion cards link authors to profiles, identify the parent author when replying, and let readers collapse and expand replies. Loading placeholders improve perceived progress. Existing For You, Latest, Following, community, and personal scopes retain their current ranking and visibility rules.

## Data model and API

No schema, route, or shared contract changes. The UI reuses existing cursor-based feed, comment, and private media APIs. Pagination now removes duplicate timeline events across and within loaded pages while retaining separate repost events for the same original post. Gallery navigation reuses the existing one-to-four attachments.

## Permissions and audit

All publication, comment, reaction, repost, bookmark, moderation, and media permissions remain in the existing Fastify and PostgreSQL checks. The new links and UI controls do not confer authority. Existing mutation receipts and domain audit coverage remain unchanged. Feed viewing, gallery navigation, scroll position, and browser-local draft editing do not create durable audit events.

## Privacy and lifecycle

Media thumbnails and the enlarged image viewer continue to request authorized media through the existing private delivery path. Draft text, language, visibility, and topics are held in browser session storage under the immutable member ID and feed room. A successful publication removes the stored draft. Attached file bytes are not stored across navigation; members must reattach files after leaving the composer. Browser storage can be unavailable, in which case the current in-memory draft remains until navigation. Existing deletion, retention, and evidence rules are unchanged.

## Localization and accessibility

Haitian Creole, French, English, and Spanish include reply-context and gallery-navigation labels. The gallery has labeled previous and next controls, position announcements, Escape to close, arrow-key navigation, and touch swipes. Image previews preserve aspect ratio. Skeleton motion respects reduced-motion settings. The existing themes, post language indicator, keyboard controls, and responsive layout remain in use.

## Reliability and recovery

The composer retains text and selections through navigation and recoverable submit errors. Existing idempotency keys prevent duplicate publication. The gallery remounts the authorized image preview when the selected image changes, avoiding stale media. Cursor requests retain the existing cancellation and retry paths. The Feed stores its scope and scroll offset when the post timestamp is opened, then restores it on return after the timeline loads. Restoration depends on the browser retaining session storage and the page having enough loaded content.

## Validation and CI

Local typecheck, lint, four-language parity, engineering standards, Legal Center integrity, 53 API tests, client and web tests, and both production builds passed. The focused Chromium run passed its Feed media cases. The full Chromium run passed 108 of 109 tests; an existing R2.5 test reached a rate-limited profile response, and its isolated rerun passed. Browser coverage includes draft restoration, gallery navigation, reply context and collapse, F2.1 interactions, responsive layouts, privacy, and moderation. No new SQL authorization tests were needed because no database or API authorization changed. GitHub Actions were not used for routine development testing under the owner's workflow.

## Documentation and operations

This report and ROADMAP.md record F2.2. The hosted development project is `hcbxulyfmdmuyccgrujs`. F2.2 introduces no migration, so there is no hosted schema write. The built Fastify API, configured for the expected hosted development project, returned HTTP 200 for health and for a public Feed read with the existing social and media projections. The configured local web route was reachable and redirected an anonymous visitor to sign-in as expected. These are read-only compatibility checks; authenticated changes were tested against disposable Supabase. Application changes are delivered through Git. No hosted application deployment was performed.

## Remaining blockers

No F2.2 schema deployment is pending. Attached image files do not survive navigation; draft text and selections do. Scroll restoration covers navigation from a Feed post timestamp and does not reconstruct earlier cursor pages. F2.3 is outside this phase.