# Characters Browser — Design

Delivery step 3 of [`docs/specs/2026-11-19-remake-design.md`](../../specs/2026-11-19-remake-design.md). Branch `remake`.

## Intent

The characters browser is the first real page of the remake and the one the portfolio is judged by. It should feel like the in-game character screen, as the 2022 Vue site did, without the legacy bugs (hand-rolled touch scroll). Once it ships, `remake` merges to `master` and replaces the legacy site.

## Goals

- `/characters` and `/characters/$id` in `apps/web`, backed by the deployed `/v1/characters` API.
- A game-style single screen: an icon strip, full-bleed gacha art, a tabbed info panel.
- Talents and constellations are readable: game markup is rendered, not shown raw.
- Works on phone widths.

## Non-goals

- Real attributes (base stats, ascension, materials). The Attributes tab shows placeholders. Real data comes in a later step.
- Language switcher UI (home/profile step). Weapons, inventory, wish, 3D.
- The Vercel cutover itself. It happens when this merges to `master` and is a separate, user-approved action.

## Anti-goals

- A wiki-style card grid with separate pages. That was option B, which was rejected.
- Any image loaded from Amber's servers. All media comes from our R2.
- A JavaScript momentum or scroll engine.

## Approaches considered

- **A. Game-style single screen (picked).** The icon strip and detail view share one route tree, and `/characters/$id` is the selected character. It's faithful to the game and the legacy site. The cost is more layout work for phones.
- **B. Gallery grid plus a detail page.** Simpler and wiki-like. Rejected because it doesn't show off the game feel.

For the talent and constellation icons:

- **1. Sync them into R2 (picked).** Keeps the "media only from R2" rule.
- **2. Hotlink Amber.** Rejected: it breaks that rule and the icons can vanish.
- **3. Omit them.** Rejected: it leaves plain-text tabs.

## Design

### Screen

```
┌──────────────────────────────────────────────────────────┐
│ [≡ filter]          Albedo · Kreideprinz   ★★★★★  Geo ⚔  │
│ ┌──┐                                    ┌──────────────┐ │
│ │ic│    gacha_splash, full-bleed,       │ Attributes   │ │
│ ├──┤    faded toward the edges          │ Talents      │ │
│ │ic│                                    │ Constellation│ │
│ ├──┤                                    │ Profile      │ │
│ │..│                                    │ (tab content)│ │
│ └──┘                                    └──────────────┘ │
└──────────────────────────────────────────────────────────┘
```

- **Routes:**
  - `/characters` redirects to the first character of the current (filtered) list.
  - `/characters/$id` shows that character.
  - An unknown id shows a not-found state inside the layout, with the strip still usable.
- **URL search params:** `element`, `weaponType`, `rarity` hold the filters, validated by the route. Switching characters keeps the filters.
- **Icon strip:**
  - The list comes from `GET /v1/characters` (all characters, fetched once and cached by TanStack Query). Filtering happens client-side.
  - Uses native overflow scroll with `scroll-snap`.
  - Mouse drag-to-scroll uses Pointer Events. Edge bounce uses CSS (`overscroll-behavior` plus a small transform on drag past the ends). There's no momentum code.
  - The selected icon is highlighted and scrolled into view.
  - Each icon is a `<Link>`, so the strip is keyboard- and middle-click friendly.
- **Filter overlay:**
  - Opened by the filter button.
  - Element, weapon type and rarity chips.
  - Selected filters show as removable chips.
  - Closes with Escape or by clicking outside.
- **Header:** name and title, rarity stars, element icon (GenshinIcon font) and weapon type.
- **Background:** the `gacha_splash` image is cross-faded when the character changes. While it loads, the element-coloured gradient shows.
- **Panel tabs:**
  - **Attributes:** placeholder rows, visibly marked as such (e.g. "—").
  - **Talents:**
    - Each talent shows its icon, name and type label. Order follows the API order.
    - Amber's `type` doesn't separate Normal Attack from Elemental Skill (both are `0`), so the label comes from the icon prefix:
      - `Skill_A_` → Normal Attack
      - `Skill_S_` → Elemental Skill
      - `Skill_E_` → Elemental Burst
      - `type 2` → Passive
      - anything else → no label
    - Description is rendered from game markup.
    - Combat talents (those with `promote` levels) show a scaling table at a chosen level (1–15, default 1).
  - **Constellations:** C1–C6 with icon, name and rendered description.
  - **Profile:** description, region (display-cased), birthday (localized month/day) and release date.
- **Phone (< 768px):**
  - The strip becomes a horizontal row along the bottom, with snap.
  - The panel becomes a bottom sheet with a collapsed and an expanded state. It's a native scroll container with CSS snap points, not a drag engine.
  - The background art stays behind.
- **3D slot:** an empty, reserved container in the layout where the R3F viewer will mount later. It renders nothing in v1.

### Game text rendering (`packages/shared` or `apps/web/src/lib/game-text.ts`)

This is a pure function from an Amber string to a React-renderable token list. It handles:

- **`<color=#RRGGBBAA>…</color>`:** becomes a span. Colour mapped to a CSS variable when it is one of the known game highlight colours, else used as an inline colour.
- **`<i>…</i>`:** italic.
- **Literal `\n` (escaped as two characters in the data) and real newlines:** line breaks.
- **`{LINK#…}…{/LINK}`:** the tags are stripped and the text kept.
- **Unknown tags:** stripped, and the inner text kept. It never throws and never uses `dangerouslySetInnerHTML`.

Talent scaling rows are `"Label|{paramN:FORMAT}…"`. A formatter substitutes `params[N-1]` with:

- `P`: percent, no decimals
- `F1P` / `F2P`: percent with 1 or 2 decimals
- `F1` / `F2`: fixed decimals
- `I`: integer

Empty rows are skipped. Unknown formats print the raw number. Both functions get unit tests built from real payloads.

### UI strings and locale

- **Locale:** an optional `?locale=` search param, otherwise the browser language mapped to `en | ru | zh-CN | zh-TW`, otherwise `en`. It's passed to every API call.
- **UI strings** (tab names, talent types, filter labels, placeholders) live in a small typed dictionary per locale in `apps/web/src/i18n/`, with no library.
  - zh-CN is written first, then zh-TW is produced with OpenCC (spec rule).
  - A type check ensures every locale has every key.

### Backend: talent and constellation icons

- **Schema:** add `'icon'` media for a new owner type `skill_icon`. `ownerId` is the Amber icon name (e.g. `Skill_S_Albedo_01`), `kind = 'icon'`. Icons are shared across characters (for example `Skill_A_01`), so they are keyed by name and not by character. This needs an enum migration.
- **Amber source:**
  - `getCharacter` also returns `skillIcons: string[]` (the unique icon names from talents and constellations).
  - The sync runs `syncMedia` for each, with owner `{ type: 'skill_icon', id: name }`.
  - The existing skip-if-same-source-URL logic makes reruns cheap.
  - A 404 counts as missing and doesn't fail the run.
- **API:** `GET /v1/characters/:id` adds `skillIcons: Record<iconName, url>` for the icons referenced in its details. The web looks icons up by the `icon` field. A missing icon renders a neutral placeholder.
- **After deploy:** run one `?details=1` admin sync. A `--full` run isn't needed.

### Data loading

- **Route loaders:** the list query is prefetched in the `/characters` layout loader, and the detail query in the `$id` loader. Both go through TanStack Query with `ensureQueryData`.
- **Prefetch on hover:** hovering or focusing a strip icon prefetches that character's detail.
- **Caching:** the API sends `Cache-Control` and an ETag. The client sets `staleTime` to 5 minutes, matching `max-age`.
- **States:**
  - Loading shows a skeleton in the panel; the strip and background stay.
  - An API error shows a retry message in place.

## Testing

- **Unit:** game-text tokenizer and param formatter (real Albedo and other payload fixtures, unknown tags, empty rows), and the locale resolver.
- **Component (Testing Library):**
  - The strip renders, the filter narrows the list, and URL params round-trip.
  - Tabs switch.
  - Not-found state.
  - `/characters` redirects to the first filtered character.
- **API:** route test for `skillIcons` in the detail response. Sync test that skill icons are uploaded once per name and that a 404 counts as missing.
- **Manual check:** against production data at desktop and 375px widths before asking to merge.

## Decisions I made (please check)

- Skill icons are keyed by icon name under a new `skill_icon` owner type, not per character.
- Filtering is client-side over the full list (136 items), not via API query params, so switching filters is instant.
- `/characters` redirects to the first character, not an empty "pick one" state.
- The talent scaling table starts at level 1 with a level selector.
- Locale comes from `?locale=` or the browser for now. The real switcher comes with the home/profile step.
- UI strings use a hand-rolled typed dictionary, not an i18n library.

## Left to the builder

Exact visual styling within the legacy look (spacing, shadows, transitions), the component split, the skeleton design and the icon placeholder art.
