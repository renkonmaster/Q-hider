# Q-Hider Design

## Purpose

Q-Hider is a configurable Chrome and Edge extension for removing distracting
parts of the traQ interface. Users choose each category independently and see
changes immediately without reloading traQ.

## Compatibility and constraints

- Ship as a Manifest V3 extension for `https://q.trap.jp/*`.
- Request only the `storage` permission and the q.trap.jp content-script match.
- Do not call the traQ API, inspect credentials, or modify traQ/traQ_S-UI.
- Keep runtime files dependency-free and loadable unpacked without a build
  step.
- Use semantic text, ARIA/role attributes, URL shapes, inline styles, and
  stable CSS-module class-name prefixes when identifying traQ elements. Never
  depend on a complete generated hash such as the selector in the legacy
  Q-Viewer-Hider extension.
- All hiding settings default to off so installation does not unexpectedly
  remove controls.

## Settings

The options page provides independent switches for:

- message stamps;
- channel viewers;
- message author information, covering icon, display name, and username;
- messages posted by Bot users;
- CSS animations, transitions, and smooth scrolling;
- typing-user indicators;
- external link previews;
- attached files and media.

It also provides a multiline custom-selector field. Each non-empty line is one
CSS selector whose matching elements are hidden. Selectors are validated
individually before saving; an invalid line prevents saving and identifies its
line number. Settings are stored in `chrome.storage.sync` under one versioned
object. The page includes “すべて表示” and “すべて非表示” bulk actions; neither
action changes custom selectors.

## Runtime architecture

The content script has three layers:

1. a settings module that validates stored data and subscribes to
   `chrome.storage.onChanged`;
2. a detector that scans a supplied DOM subtree and marks recognized elements
   with stable `data-q-hider-*` attributes;
3. a style controller that mirrors enabled settings onto
   `document.documentElement` and injects one scoped stylesheet.

A debounced `MutationObserver` scans added subtrees and rechecks nearby message
or sidebar containers. Applying the same settings or scanning the same subtree
twice is idempotent. Disabling a category removes the relevant root state and
reveals elements immediately; detector markers may remain because they are
inert without the root state.

## Detection rules

Detection follows current traQ_S-UI component semantics while tolerating
generated-class hash changes:

- stamps: stamp images have a title/alt name, a traQ file URL, and a compact
  fixed-size ancestor; the detector marks the containing stamp control or
  message stamp list rather than arbitrary uploaded images;
- viewers: expanded cards are located by an `h2` whose normalized text is
  `閲覧者`; collapsed viewer icon cards are recognized as the leading sidebar
  user-icon list adjacent to other titled channel sidebar cards;
- author information: within a message container, the background-image user
  icon and header spans for display name and `@username` are marked, while
  message-body mentions are left visible;
- Bot messages: an exact visible `Bot` grade badge inside a message header marks
  the nearest complete message container for hiding; the channel sidebar card
  titled `参加BOT` is not treated as a posted message;
- typing indicators: the indicator immediately associated with the message
  composer is marked, not arbitrary animated ellipses;
- link previews: external OGP cards associated with message content are marked;
- attachments: message file-summary, file-list, image, audio, and video blocks
  are marked without hiding ordinary text links to `/files/...`;
- animations: no element detection is required; the stylesheet sets animation
  and transition duration to zero and disables smooth scrolling below the traQ
  root when enabled;
- custom selectors: valid selectors are evaluated against each scan root and
  their matches receive `data-q-hider-custom`.

Known CSS-module source-name prefixes may be used as one signal, but every
message-, stamp-, and sidebar-level decision must require at least one other
semantic signal. This prevents a generic class such as `_container_*` from
hiding unrelated UI.

## Styles and layout behavior

Each enabled setting is represented by a `data-q-hider-<category>="true"`
attribute on the root element. The injected stylesheet hides marked elements
with `display: none !important`. Hiding author information also collapses the
message's author column so message content uses the reclaimed space; it must
not leave a permanent blank gutter. Hiding attachments or stamps removes their
associated margins. Disabling a setting removes these layout adjustments.

## Error handling and safety

- Missing or malformed storage uses all-off defaults.
- A selector validation failure never overwrites the last valid settings.
- Runtime selector failures are isolated per selector and logged once.
- A changed traQ DOM causes the relevant category to stop matching rather than
  hiding a broader ancestor.
- Mutation batches are coalesced and scans are bounded to added subtrees to
  avoid continuous whole-page work.
- The extension does not remove nodes or mutate traQ data; it only adds marker
  attributes and CSS visibility rules.

## Testing

Separate settings normalization and DOM classification from the Chrome event
adapter. Use Node 18 or later with `node:test`, `node:assert/strict`, and a
development-only DOM implementation for fixture tests. Runtime files do not
import the test dependency.

Fixture tests model current traQ_S-UI message, stamp, viewer, Bot badge,
composer, OGP, and attachment structures. Tests cover positive and negative
detection, idempotent rescans, live settings changes, all-off restoration,
custom-selector validation and marking, malformed storage, observer batching,
manifest entry points, and the absence of API/host permissions beyond the
content-script match. Final verification runs all tests and syntax-checks every
runtime JavaScript file.

## Out of scope

- Removing messages from traQ, changing notification state, or mutating server
  data.
- User-specific Bot allow/deny lists in the first version.
- Supporting arbitrary origins or browsers without the Chrome extension API.

## Acceptance criteria

Each documented category can be toggled independently, updates an already-open
traQ tab, survives browser restart, and restores the untouched native view when
disabled. Bot and user-information rules affect message rows only, custom
selectors are safely validated, exact generated CSS hashes are absent, and all
automated checks pass.
