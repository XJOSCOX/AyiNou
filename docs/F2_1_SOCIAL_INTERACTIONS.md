# F2.1 — Social interactions and following

## Scope

F2.1 extends the existing follow graph and chronological Following Feed. It adds mutual-follow indicators, relevant suggestions, organization authorship, per-follow repost controls, reposts, quote posts, private saved posts, canonical mentions, Unicode hashtags, and independent interaction notification preferences. The existing reactions, comments, reporting, safety controls, and follower notifications remain in use.

## Data model and API

Migration `20261123090000_f21_social_interactions.sql` adds organization attribution to posts, repost preferences to existing follow relationships, and separate tables for reposts, quotes, bookmarks, hashtags, and canonical mentions. Existing post creation and command receipts are reused. GET `/api/v1/feed/social` serves saved posts and hashtag timelines. GET `/api/v1/discover/hashtags` supplies prefix discovery. PUT `/api/v1/posts/:id/social` sets repost or bookmark membership. POST `/api/v1/posts/social` publishes an organization or quote post with an idempotency key. The authenticated member preference endpoints manage per-account repost visibility and mention, repost, and quote notifications.

## Permissions and audit

Fastify validates the live session and bounds input. PostgreSQL checks the signed-in subject, source visibility, account safety, and active organization roles. Only authorized organization owners, administrators, and editors can publish as their organization. Community posts remain in their original audience and cannot be reposted or quoted. Quote sources cannot themselves be quotes. Durable content and moderation evidence remain in the original ledgers. Relationship and notification preferences, bookmarks, and repost membership intentionally represent current state. Post publication reuses command receipts and eligible notifications are deduplicated. The Unified Audit Center does not expose private bookmarks or preferences.

## Privacy and lifecycle

An original post retains its author and controls access to previews, reposts, tags, and actionable notifications. A saved reference or quote can show an unavailable state without revealing the original. Bookmark lists are strictly self-scoped. Mention rows bind stable account IDs and only return profiles that are currently eligible. Use `@org:handle` to select an organization explicitly when names coincide. Historical raw mentions remain text until edited or newly published. F2.1 reuses the existing content lifecycle and keeps restricted content out of search results.

## Localization and accessibility

English, French, Haitian Creole, and Spanish messages cover the new controls, empty states, and notification labels. Post content keeps its original language. Hashtags are normalized to NFC so equivalent accented forms share a timeline. Feed controls use existing theme tokens, accessible names, and wrapping layouts. The Saved Posts entry is in the feed.

## Reliability and recovery

Timelines are capped and use timestamp and ID keyset pagination. Social relationship writes use desired-state requests and unique keys. Quote and organization publication uses the existing post command transaction. Notification delivery and visibility recheck current permissions. Forward migrations handle schema corrections. Existing audience checks remain the source of truth for every reference.

## Validation and CI

Development tests run locally. Disposable Supabase and Chromium tests exercise concurrency, original attribution, access loss, organizations, block and follow preferences, mentions, tags, notification scoping, and saved posts. GitHub is used for source delivery.

## Documentation and operations

The roadmap and audit matrix describe F2.1. Hosted deployment uses the linked development project and a dry run for the exact migration. The rollout preserves existing accounts and social records.

## Remaining blockers

Hosted verification and final regression results are recorded below when complete.
