# Characters Browser — Design

Delivery step 3 of [`docs/specs/2026-11-19-remake-design.md`](../../specs/2026-11-19-remake-design.md). Branch `remake`.

## Intent

The characters browser is the first real page of the remake and the one the portfolio is judged by. It should feel like the in-game character screen, as the 2022 Vue site did, without the legacy bugs (hand-rolled touch scroll). Once it ships, `remake` merges to `master` and replaces the legacy site.

## Goals

- `/characters` and `/characters/$id` in `apps/web`, backed by the deployed `/v1/characters` API.
- The legacy 2022 character screen, rebuilt: top bar with avatar strip, namecard + gacha art, rhombus menu, right info panel.
- Talents and constellations are readable: game markup is rendered, not shown raw.
- Works on phone widths.

## Non-goals

- Real attributes, weapons, artifacts, friendship, outfits, demo videos. Their legacy slots render with placeholders; data comes later.
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

### Screen (revised: legacy layout)

The first build used a side strip, a bottom sheet and a tab bar. The user rejected it: the screen must reproduce the legacy 2022 layout (`master:src/components/CharacterUI`), rebuilt cleanly in React. It should look the same in structure, fonts, colours and fade animations, but it's not a pixel-for-pixel copy.

```
┌──────────────────────────────────────────────────────────────────┐
│ ❄ Cryo/Ayaka   (○)(○)(○)(○)(○)(○)(○)(○) avatar strip →      (✕) │  top bar, 75px, rgba(0,0,0,.21)
│ ◆ Attributes                                     Kamisato Ayaka   │
│ ◆ Weapon                                         ✦✦✦✦✦           │
│ ◆ Artifacts           gacha splash, 100vh tall,  Level 90 / 90    │
│ ◆ Constellation       centred over the namecard  ── stats ──      │
│ ◆ Talents             art (cover, dimmed)        [ Details ]      │
│ ◆ Profile                                        Friendship  10   │
│                                                  description      │
│ [▦][◐]                                           [ Wardrobe ]     │
└──────────────────────────────────────────────────────────────────┘
```

- **Background:**
  - The character's namecard (`namecard` media, cover, with a `rgba(0,0,0,.12)` dim) fills the screen.
  - The `gacha_splash` sits centred on top at `100vh` tall.
  - Both cross-fade when the character changes.
  - Without a namecard, the element-coloured gradient shows.
- **Top bar:**
  - Element glyph and "Element/Name" on the left.
  - The horizontal avatar strip in the middle: legacy 55px circles with a `#6c9992` border, active/hover `#5bb8d9` fill with a `#7ec8b9` border. It uses native overflow scroll with mouse drag-scroll; each avatar is a `<Link>`.
  - On the right, a legacy round close button (`#e0ddd4`, 32px) that links to `/`.
- **Left menu:**
  - The legacy rhombus list (`ListItemRhombus`): Attributes, Weapon, Artifacts, Constellation, Talents, Profile.
  - The active item has the white glowing rhombus and its nudge animation.
  - The selected section is the `section` search param, so it survives switching characters and reloads. The default is Attributes.
- **Right panel** (300px; translucent rounded card):
  - **Attributes** (legacy `AttributesContent`):
    - name (28px), rarity stars (four-point stars in the rarity colour);
    - "Level 90 / 90" with the blue glowing progress bar;
    - HP, ATK, DEF, Elemental Mastery and Stamina, each showing "—";
    - a **Details** pill that opens a modal reading "No data yet";
    - Friendship, fixed at 10 with the pink bar, as decoration;
    - the description (scrolls past 90px);
    - a disabled **Wardrobe** pill.
  - **Weapon / Artifacts:** "No data yet".
  - **Talents / Constellation:** a game-style list (icon in a circle plus name, and the kind label for talents). Clicking an entry opens a detail modal with the rendered game text. Combat talents also get the level selector and scaling table.
  - **Profile:** title, region, birthday and release date, in the same card style.
- **Bottom-left buttons** (legacy white 30px squares on a dark pill):
  - **Grid** toggles the left **Character Selection** panel: a "Character Selection" heading, a grid of avatars, and the element, weapon and rarity filters with removable chips. The left menu hides while it is open.
  - **Hide** toggles every UI layer off except the background and a restore button.
  - There's no demo-video button, since there are no videos.
- **Phone (portrait, < 768px):**
  - The top bar stays, with a smaller strip (45px).
  - The splash stays centred.
  - The menu becomes a horizontal scrolling pill bar.
  - The right panel becomes a bottom sheet, scrollable, at most 45dvh.
  - The bottom buttons sit above the sheet.
- **Routes:**
  - `/characters` redirects to the first filtered character; `/characters/$id` shows one.
  - An unknown id shows not-found in the right panel, with the strip usable.
  - Search params are `element`, `weaponType`, `rarity`, `section` and `locale`.
- **3D slot:** an empty `data-slot="viewer3d"` container stays reserved.

### Backend: namecard

- Add a `namecard` media kind.
- In the Amber character, `other.nameCard.icon` = `UI_NameCardIcon_<X>`. The art is at `https://gi.yatta.moe/assets/UI/namecard/UI_NameCardPic_<X>_P.png`, synced to R2 like the other media. When `nameCard` is missing, no namecard is synced.
- The list and detail `media` maps expose it as `namecard`.
- The strip keeps the front `icon`. Amber doesn't serve the legacy side-facing avatar icons (403).

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
