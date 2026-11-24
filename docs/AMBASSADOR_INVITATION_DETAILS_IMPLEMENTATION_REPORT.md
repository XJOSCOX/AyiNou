# Founding Ambassador invitation details

## Scope

Members can open an invitation to see the contribution category, the current status, the date sent, the response deadline, the sender, a message from the program, and what participation involves. Historical invitations show the recorded acceptance date where applicable. Invitations that expired show the expiration date and have no response controls.

## Data model and API

The migration adds an optional recipient-facing message to the private ambassador case. The member endpoint adds the message and the timestamp of the existing invitation audit event. The admin action accepts an optional message when sending an invitation. The web form asks for a message. Existing invitations and older API clients continue to work.

## Permissions and audit

The member read is scoped to the authenticated recipient and published directory responses do not include invitation data. Sending calls the existing MFA-protected admin transition, which checks the case version, records the audit decision, and queues the notification. The message and transition commit together. No additional audit event is required for the same send.

## Privacy and lifecycle

A message is shared with the recipient and belongs with that member’s invitation history. The administration rationale stays in the restricted audit history. The recipient sees the sending administrator’s public display name and badges when their profile is discoverable, public, and visible to the recipient. Other invitations use the program team label. Account identifiers stay private. The new field uses the existing case retention and access controls. Recipient deletion clears the message with the recipient link.

## Localization and accessibility

The member interface and admin field use all four supported locales. The invitation opens with a native disclosure operated by keyboard or pointer. Dates have machine-readable values and adapt to the viewer’s locale. The layout stacks at mobile widths.

## Reliability and recovery

The invitation send uses the existing transaction and row lock. On validation error, cancellation, or a stale version, the original case and message are preserved. Legacy invitations without a message display the role and category. A database rollback can restore the previous member projection while retaining existing case data.

## Validation and CI

The disposable browser and API regression passed for recipient access, ordinary-member denial, stale actions, private administrative reasons, visible and hidden sender states, message cleanup, keyboard disclosure, the deadline, and the expired state. Web and API type checking, targeted lint and engineering standards passed locally. No hosted application build or CI run was published.

## Documentation and operations

The owner authorized migration `20261124151000_ambassador_invitation_details` on linked AyiNou project `hcbxulyfmdmuyccgrujs`. The tested SQL matched the SHA-256 checked at rollout. The dry run proposed only this migration. The postflight confirmed it was recorded, zero migrations were pending, anonymous execution was denied, and the case table remained private. The case and audit fingerprints matched before and after rollout.

## Remaining blockers

The database change is live. The application changes were verified locally and have not been released to hosted application infrastructure.
