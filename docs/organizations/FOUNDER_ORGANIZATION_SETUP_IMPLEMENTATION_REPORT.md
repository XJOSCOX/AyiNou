# Founder organization setup correction

## Scope

The recognized Founder can resume and complete a new ordinary organization draft using trusted founding provenance. This covers new businesses and the other ordinary organization kinds already supported by O4.

## Data model and API

One forward migration updates the existing eligibility predicate shared by the draft read and completion command. It creates no tables and changes no route or response shape.

## Permissions and audit

PostgreSQL checks the current eligible account and committed Founder bootstrap. The existing live session, completed personal profile, authority declaration, handle uniqueness, and creation limit still apply. The organization and initial ownership are written with the existing institution audit events and command receipt.

## Privacy and lifecycle

The draft remains private until submitted. Completing setup leaves the organization unverified and creates no personal identity record. Existing organization ownership claims and protected government setup keep their own review paths.

## Localization and accessibility

The existing confirmation checkbox and submit button become available when the draft qualifies. Their existing English, French, Haitian Creole and Spanish labels are reused.

## Reliability and recovery

The original draft can be resumed in place. The migration preserves saved intents, approvals, roles and audit history. A forward correction to the eligibility predicate can withdraw the Founder branch.

## Validation and CI

The disposable organization setup regression exercises the recognized Founder, a member without reviewed identity, and the Founder attempting to use the new eligibility for a protected type or an ownership claim. Existing setup and publishing tests exercise neighboring workflows.

## Documentation and operations

The Account and Authentication blueprint records the scoped rule. Hosted rollout uses the exact reviewed migration on the development project and verifies history, grants and eligibility without submitting an owner's draft.

## Remaining blockers

An eligible Founder must still open the saved draft and confirm their authority to create the organization. Organization verification follows its separate workflow.
