# U1 username moderation policy

Version 1 accepts 3–24 ASCII characters, starting with a letter. Input trims ASCII whitespace around the handle and folds ASCII capitals. Unicode confusables, emoji and other punctuation are invalid for handles. Public display names retain Unicode and accents.

The SQL policy matches enumerated whole official terms and carefully selected variants, with underscore removal and a small leetspeak fold. Ordinary allowed names containing similar fragments, such as `supporter_marie`, remain valid. The curated offensive list targets explicit hate, sexual harassment, threats and intimidation in Haitian Creole, French, English and Spanish. It checks exact components or a fully joined expression. It cannot determine intent, resolve all real-world impersonation or catch every new spelling or contextual abuse. Staff can investigate impersonation through existing reporting and use a username review command when appropriate.

The fixed official vocabulary is versioned in SQL. The configured Founder handle is checked separately from that vocabulary, including before Founder enrollment completes. Availability folds it into the generic unavailable status. A name, an address, a successful signup or an availability result grants no platform authority.

## Review and appeal

The signup field links to Ayinou’s public contact address for suspected false positives. A member or prospective member can provide the requested handle, language and request reference if available. The review only needs context about the handle. Keep private identity documents and unrelated personal information out of ordinary email. Mailbox delivery and response staffing require operational confirmation.

A current platform administrator with recent TOTP can use the restricted review command to hold an unassigned handle, release a manual hold after review, record an appeal decision, or correct an ordinary account’s current handle. A correction preserves the account UUID, records the actor and decision and disables the old public redirect. Regular profile changes preserve redirects. Corrections cannot target the acting administrator, the trusted Founder, administrator accounts or the protected Founder handle. Manual releases never override the fixed system, lexical or Founder rules. Change the versioned policy through an additive, reviewed migration to correct a lexical false positive. Record only categorical reasons and command receipts, with private correspondence handled through the designated support process.
