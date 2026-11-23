# F2.4 — Discovery, member profiles, following and privacy

## Scope

F2.4 adds member discovery and social profiles, follow approvals, and post audience controls to the existing app.

## Data model and API

Discover serves separate People, Institutions, and Posts searches. People supports partial and typo-tolerant names, eligible avatars and badges, and filters for disclosed country, Haitian department, interests, and language. Follow suggestions use the existing discovery graph. The post search supports keywords, hashtags, language, topic, and a start date. Trending requires at least three distinct eligible contributors to the same public hashtag in seven days.

## Localization and accessibility

Settings, audience controls, profile activity, and discovery labels are available in English, French, Haitian Creole, and Spanish. Filter controls use native fields.

Member profiles use the shared app layout and honor visibility and block state. Profile owners can enable Posts, Replies, and Media and search their eligible posts. Social privacy and incoming and outgoing requests are available in Settings. Existing profile settings still control discoverability, geography, and interests. A private profile reachable by its username shows eligible signed-in viewers its name and handle until approval. Public and limited profiles retain existing per-field settings. Language disclosure, profile activity, and new request notifications require opt-in.

## Permissions and audit

Preferences and requests are current member state. Eligible follow notices are written atomically with the request or approval. Searches do not create durable audit events.

Historical follows remain in place. Only an approved request grants private profile details or access to approval-only Followers posts. Follow removal and blocking take effect on new reads. Personal posts can use the Followers audience. Organization and community posts use their existing audiences. A change back to a public profile does not widen approval-only publications. Authors can explicitly change the audience of a post. Reposts and quote sources require a public post. Existing bookmarks and notifications return unavailable results when the viewer loses access.

## Reliability and recovery

Request writes use pair locks shared with blocking and a unique requester/target key. Forward recovery can close the new entry points while preserving user preferences, posts, and follows.

For You reuses its snapshot and feedback controls. Current audience and moderation eligibility apply during ranking and snapshot reads. Followed organizations contribute to the Follow explanation. Language matching requires the viewer’s consent. Community discussions remain in their scoped feeds. Public project references on organization posts keep their existing visibility. Trending is hashtag-based.

## Privacy and lifecycle

Already rendered content and short-lived signed avatar URLs can remain visible during their existing lifetime. A new profile, discovery, post, or attachment request checks current access. The existing synthetic privacy export can include the Followers audience on the author’s posts. Its scope for following and account data stays governed by the existing export policy.

## Validation and CI

Local validation passed for the full migration chain, typecheck, lint, shared contracts, locale parity, API and web tests, and production-mode builds. Fifteen distinct Chromium cases passed across the relevant suites, including mobile Settings in all four languages and a synthetic privacy export containing a Followers post. No GitHub Actions run was used for validation.

## Documentation and operations

The roadmap, audit coverage matrix, and feature review registry record the change. The tested implementation is commit `8429314e8593a03e3ee8f67c34e72681d8df8fc9` on `main`.

The authorized hosted project `hcbxulyfmdmuyccgrujs` applied exactly these four migrations:

- `20261123125000_f24_profile_privacy`
- `20261123125100_f24_discovery_timelines`
- `20261123125200_f24_followers_audience`
- `20261123125300_f24_audience_integrity`

The postflight dry run reported zero pending migrations. Both new tables had RLS and denied direct member and guest reads. The member settings RPC rejected guest access, and both audience constraints were present. Recorded counts matched before and after for profiles, member follows, institution follows, posts, verification applications, and administration audit events. The refreshed local API returned a healthy response. Codex’s browser loaded post discovery, the social privacy settings, and the follow request list as test02 against hosted Supabase.

## Remaining blockers

Hosted database migration and the connected local application are verified. Public application hosting is outside this release. Previously issued signed avatar URLs retain their existing expiration window, and trending ranks hashtags from eligible public posts.
