# Poll ballot display and organizer badges

## Scope

The Polls directory and detail show verification badges for visible organizers. The detail view includes a live countdown and places aggregate vote bars directly under ballot options.

## Data model and API

Migration `20261124149000` adds optional `scopeBadges` metadata to the existing poll projection. The countdown uses the existing server timestamp, and the bars use the authorized aggregate result.

## Permissions and audit

Member and organization badges follow the existing disclosure rules. Poll and ballot commands keep their existing eligibility checks, access rules, and audit records.

## Privacy and lifecycle

The countdown does not change when voting opens or closes. Result bars appear only when the server returns aggregates. The display does not expose voter identities or individual choices to other members.

## Localization and accessibility

Countdown labels are available in English, Haitian Creole, French, and Spanish. The timer avoids announcing every tick. Result bars use labeled meters with text percentages and a label for the leading option.

## Reliability and recovery

The countdown tracks elapsed time against the server sample and stops at zero. The existing view refresh checks the authoritative voting state. Restoring the prior badge projection is a compatible rollback.

## Validation and CI

The Polls browser suite covers organizer badge display, both countdown boundaries, ballot privacy, aggregate results before and after voting, and refresh while a poll is open.

## Documentation and operations

The existing Polls entry points remain available. Migration `20261124150000` lets eligible viewers see the practice poll’s aggregates as soon as voting opens, before submitting a ballot. Visible open polls refresh aggregates every 15 seconds. Polls configured to show results after finalization retain that policy.

## Remaining blockers

Hosted AyiNou received the tested badge migration. Postflight confirmed four identical poll rows and zero pending migrations. The connected local app showed the Founder Verified badge in both Polls views and an enabled demo ballot.
