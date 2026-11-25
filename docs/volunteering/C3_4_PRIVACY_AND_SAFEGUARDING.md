# C3.4 Privacy and safeguarding

| Record | Contents and readers |
| --- | --- |
| Contact consent | Current opt-in, version, timestamp and retry receipt. The member can read and withdraw their own choice. |
| Invitation | Project, opportunity, exact requirement revision, organizer and recipient references, bounded message, timestamps and status. The recipient and currently authorized sender see current content when still eligible. |
| Lifecycle event | Transition, version, actor, timestamp and optional command receipt. A report reference points to the native moderation record. |
| Application provenance | Optional native application ID read within the invitation command and its restricted ledger. No general application projection exposes it. |
| Notification | Recipient, invitation reference, status and native read state. No message, contact details, skill data or schedule is copied. The existing notification surface and mute behavior are reused. |
| Founder configuration | Immutable preparation version, administrative actor, workspace, reason and command receipt. Contains no volunteer profiles. |

System-owned history and statutory holds need a dedicated review before launch. Consider short post-expiry availability for message content, separation of quota metadata from message retention, and a reviewed hold-aware purge process. These are design recommendations. C3.4 defines no legal retention policy and enables no real export or erasure processing. The existing notification view keeps its read window. Deleting an invitation cascades its events and notifications. Deleting an account cascades related invitation content and contact flags. Native application and report records retain their existing independent lifecycle, with invitation references cleared when those native rows are deleted. Review these cascades under the real privacy and hold workflow before any activation.

Screening-flagged opportunities are excluded from outreach. There is no youth intake, regulated placement, credential certification or background-check processing. Organizer discovery and contact require separately recorded consent. Native profile privacy and blocks cannot be overridden. Existing reports and moderation enforce the same safety boundaries on native project activity. Identity is an organizer authorization prerequisite and confers no ranking advantage.
