# M2.4 Independent appeals and event moderation security

## Scope

Eligible M2.2 suspensions and bans, M2.3 feature restrictions, and event restrictions with a verified report reference support one ordinary appeal per decision. An organizer can appeal an event restriction from the event. Members can submit and track their own appeals from Account access during an eligible restricted session. Older account sanctions are eligible only when an original audit event can be matched with the current restriction.

## Data model and API

PostgreSQL stores a unique appeal for each native domain and decision reference. The 14-day deadline uses the source decision’s timestamp and is retained on the appeal. Case revisions and client request IDs protect concurrent mutations and retries. Staff can assign, reassign, uphold, return for correction, or find in favor of an appeal. An authorized leader can close cases whose original decision has been superseded or become unavailable. An appellant can withdraw or respond to a request for correction through the same case.

## Permissions and audit

Restricted members use the existing M2.2 notice-session boundary. Live, MFA-verified members assigned the verification reviewer role use the existing private review workspace and must be assigned to the appeal. PostgreSQL excludes original decision makers, appellants, event reporters, and material resource conflicts. Leaders can see safe summaries and assign independent reviewers through the private administration workspace. A finding supporting reversal of a protected decision enters the protected pending queue. Only the recognized Founder can approve or decline release. A material conflict prevents the Founder from executing release and leaves the case pending.

Event moderation checks the organizer, all reporters for that event, material organizational relationships, and implicated community or project authority. New moderation decisions carry the originating report reference. Older audit entries remain intact. A denial by the conflict check leaves a minimized event. The existing Moderation Center and A1A readers project safe decision and appeal references over native history.

## Privacy and lifecycle

Appeal explanations and written findings use the private ledger. Assigned eligible reviewers can read relevant submissions and findings. A Founder considering a protected release can see the independent finding only when eligible. Member notices and general audit summaries expose status, case references, event outcome or enforcement category, and timing. Reporter identities, private evidence, attendee lists, meeting details, and internal reasons are excluded from these projections. Notices appear in authenticated surfaces. Event notices follow the existing event notification preference.

Appeal records and enforcement history remain subject to the applicable source retention and legal holds. User references can be cleared by account deletion, and member notification rows follow account deletion. Automatic deletion or export of private appeal narratives requires a separate retention and privacy workflow review.

## Localization and accessibility

Haitian Creole, French, English and Spanish cover forms, notices, states, staff decisions and history. The forms use semantic labels, expandable controls, keyboard-operable buttons and accessible error feedback. They reuse AyiNou’s responsive panels and theme tokens.

## Reliability and recovery

Submission, workflow decisions, notices and audit append in the same transaction. Pending review preserves existing enforcement. A favorable decision can lift only the referenced current sanction. M2.2 reauthentication still applies on account release. Event restoration requires the same active restriction on a published, unended event, and the ordinary audience and visibility rules still apply. Expired and superseded sanctions retain their history and never trigger a release of a later sanction.

## Validation and CI

Local verification passed TypeScript, ESLint, shared contracts, four-language translation checks, client error tests, all 53 API tests, web environment checks, engineering standards and the local production build. Eighteen browser and database integration tests passed across M2.1–M2.4, Events, A1A audit, password recovery, groups, and ballots. M2.4 cases exercised reviewer and Founder conflicts, protected release, deadlines and replay, direct RPC grants, report linkage, notice privacy, restoration and canceled-event preservation.

## Documentation and operations

The additive migration is `20261123134000_m24_independent_appeals.sql`. Verify the exact linked project, release SHA and migration history before applying the approved migration. Postflight checks cover the new grants, unchanged existing enforcement records and the connected local application. Rolling back UI entry points preserves the audit and existing restrictions. Database remediation should preserve original decisions and the associated evidence.

## Remaining blockers

No emergency action without a report was introduced. Historical event restrictions without proven report linkage and provider-level bans remain outside this appeal workflow. A protected case stays pending if the recognized Founder cannot act.
