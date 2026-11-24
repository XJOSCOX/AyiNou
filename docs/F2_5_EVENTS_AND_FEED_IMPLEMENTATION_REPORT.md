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

Events and Feed controls include English, Haitian Creole, French, and Spanish. Event times use the viewer’s local time zone. The editor handles daylight-saving gaps and preserves an existing instant when editing an ambiguous wall time. Pages use the shared navigation, footer, responsive cards, labeled controls, and accessible status messages.

## Reliability and recovery

RSVP and capacity updates lock the event row, including concurrent attempts for the last seat. Event writes reuse a request ID for creation and announcements, and event edits use version checks. Notifications are deduplicated, capped per operation, and limited by preference and live visibility. Translation requests have a per-member budget and deliberately have no provider or cache configured. The provider interface accepts only authorized public content and has a four-second timeout, an input limit, and literal token protection.

## Validation and CI

The local browser suites exercise Events and Feed. Coverage includes simultaneous RSVP, private links, organization authority, event sharing, notification access, daylight-saving boundaries, language filters, and the unavailable translation state. Route inventory, shared contract, localization, lint, typecheck, and production build checks run locally.

## Documentation and operations

Deploy migrations in chronological order after local validation. The six Events controls and Feed language filtering default to on. Translation defaults to off. A Founder can find these controls in Platform administration under Events and Feed. Members manage event notices in notification settings and language choices on the Feed.

## Remaining blockers

Cover images use HTTPS URLs. Event-specific image uploads, invitations, and reminder scheduling are outside the shipped workflows. Live translation requires an approved provider and a privacy review. Provider output must be tested against public multilingual sources before it is enabled.
