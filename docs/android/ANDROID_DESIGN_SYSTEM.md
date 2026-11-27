# Android design system

AyiNou uses Jetpack Compose and Material 3 with light and dark semantic palettes adapted from the website. The launcher, splash and headers use the existing AyiNou mark. Native vector drawables adapt the supplied SVG paths. The Dashboard uses the existing AyiNou coastal image and the Feed sample uses the existing verification mark with a sample label. Neither should be interpreted as an assertion about a real account.

The shared primitives include an icon, tactile section row, outlined panel, message banner, sample avatar, and static loading skeleton. Material 3 supplies bars, fields, buttons, alert dialogs, radio controls, snackbars and progress. Navigation uses resource-backed labels and content descriptions. Surfaces use system insets and lazy layouts, with a reading-width cap on large displays. Settings can switch between light, dark and system. Centered content adapts to a small screen while the shell uses the full screen.

All user-facing text is in Android resources. Haitian Creole is the default resource set and is always an explicit in-app choice. French, English and Spanish are separate resource sets. The current selection localizes Compose without depending on the system language picker. Locale-aware formatting is used for the sample publication date. Feed buttons are visibly disabled in the development preview.
