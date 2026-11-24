# F2.5 Community Events and Multilingual Feed

## Scope

Events add personal and organization organizers, scoped discovery, RSVP management, reporting, and public event sharing. Feed follows member-selected content languages independently of interface settings. Translation is an explicit request and defaults to off.

## Data model and API

Event configuration, RSVPs, organizer updates, reports, and decisions live in private Feed relations with caller-bound RPCs. Discovery covers upcoming, past, following, community, RSVP, and organizer views. Feed shares use existing personal and organization posts and include a live-checked event projection. Members can select all languages or any combination of Haitian Creole, French, English, and Spanish. Latest, Following, and For You apply these preferences before pagination. Discover retains its explicit post language filter.

## Permissions and audit

Personal organizers need an eligible member session and an active profile. Organization event actions reuse verified public organization and live owner, administrator, or editor authority. Project links require existing project authority and visibility. Moderation requires a moderation role and fresh MFA. Event lifecycle and moderation decisions are retained in the event audit ledger. Founder changes use version checks, written reasons, the existing private workspace, and the boolean policy audit ledger.

## Privacy and lifecycle

Venue and meeting links appear only on event details for organizers and eligible Going attendees. Participation defaults to private, and only authorized organizers can see name-sharing attendees or aggregate counts. Public shares carry the event name, organizer, start, and status after live visibility checks. Disabling Events keeps event and RSVP records and allows organizers to cancel. Notification text is generic and requires the event to remain visible to the recipient.

## Localization and accessibility

Events and Feed controls include English, Haitian Creole, French, and Spanish. The agenda, event detail, and shared event previews display the event’s time zone. The editor handles daylight-saving gaps and preserves an existing instant when editing an ambiguous wall time. Pages use the shared navigation, footer, responsive cards, labeled controls, and accessible status messages. The Filters button comes before the visible text search when a page has both. Opening and closing the filters preserves the selections.

## Reliability and recovery

RSVP and capacity updates lock the event row, including concurrent attempts for the last seat. Event writes reuse a request ID for creation and announcements, and event edits use version checks. Notifications are deduplicated, capped per operation, and limited by preference and live visibility. Translation requests have a per-member budget and deliberately have no provider or cache configured. The provider interface accepts only authorized public content and has a four-second timeout, an input limit, and literal token protection.

## Validation and CI

The local browser suites exercise Events and Feed. Coverage includes simultaneous RSVP, private links, organization authority, event sharing, notification access, daylight-saving boundaries, language filters, and the unavailable translation state. Route inventory, shared contract, localization, lint, typecheck, and production build checks run locally.

## Documentation and operations

Deploy migrations in chronological order after local validation. The six Events controls and Feed language filtering default to on. Translation defaults to off. A Founder can find these controls in Platform administration under Events and Feed. Members manage event notices in notification settings and language choices on the Feed.

Hosted AyiNou development project `hcbxulyfmdmuyccgrujs` received exactly migrations `20261123130000`, `20261123130100`, and `20261123130200` from commit `27eb229f05e8b4ac833206e5537eeaec6d5437f1`. The postflight confirmed the feature defaults, checked private RSVP table access, and found zero pending migrations. Existing account, organization, post, and notification counts matched the preflight. Events and Feed language settings loaded in the hosted-connected local app using the test02 account.

## Events interface follow-up

The Events directory uses a linked agenda with calendar dates, local times, locations, organizer badges, and descriptions. Filters stay collapsed until opened and search stays visible. The detail view groups the schedule, format, and organizer above the description and participant counts. Draft actions sit beside the draft notice. The copy is available in all four supported languages.

Browser verification found fictional drafts under Organizing. The event browser and API suite passed against disposable Supabase, covering mobile navigation, private locations, RSVP capacity, and verified organizer metadata in the directory, detail API, and shared preview. The hosted organizer badge migration `20261124147000` updates the existing read helper without changing event rows or grants. The hosted postflight showed four events and zero pending migrations. The connected local app displayed the Founder Verified badge for test02.

The directory and detail view share the Events header, description, and tab links. The detail view has a right-aligned Back link. Organizers can choose a linked community separately from the audience. Public events can be viewed without an account and signed-in members can RSVP. Community-only events require membership in the linked community. Published linked events appear under My communities for members of that community. Migration `20261124148000` was validated with the event browser and API suite and applied to hosted AyiNou. The postflight confirmed five identical event rows and zero pending migrations.

## Remaining blockers

Cover images use HTTPS URLs. Event-specific image uploads, invitations, and reminder scheduling are outside the shipped workflows. Live translation requires an approved provider and a privacy review. Provider output must be tested against public multilingual sources before it is enabled.
