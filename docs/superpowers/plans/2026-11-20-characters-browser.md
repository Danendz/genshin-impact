# Characters Browser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A game-style characters screen at `/characters` and `/characters/$id`, backed by `/v1/characters`, with talent and constellation icons synced into R2.

**Architecture:** The backend gains a `skill_icon` media owner type. The Amber source lists skill icon names, the sync stores each once by name, and the character detail response carries a `skillIcons` map. The web app adds a `/characters` layout route (icon strip, filter overlay, background, header) and a `$id` child route (tabbed panel). It uses TanStack Query and pure helpers for game text, locale and UI strings.

**Tech Stack:** Hono, Drizzle/Postgres, Vitest; React 19, TanStack Router and Query, Tailwind v4, Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-20-characters-browser-design.md` (parent: `docs/specs/2026-11-19-remake-design.md`).

## Global Constraints

- All images come from our R2 (`MEDIA_PUBLIC_URL`). Never load from Amber in the browser.
- No hand-rolled momentum scroll. Use native overflow plus `scroll-snap`. Mouse drag-to-scroll uses Pointer Events.
- Never use `dangerouslySetInnerHTML` for game text.
- Locales: `en | ru | zh-CN | zh-TW`. API param `locale`. UI strings: zh-CN written first, zh-TW produced with OpenCC (`opencc-js`, cn→tw).
- Migrations run only via `pnpm --filter @gi/db db:migrate` (pre-deploy). Generate them with `pnpm --filter @gi/db db:generate`.
- `pnpm lint`, `pnpm typecheck` and `pnpm test` must pass after every task. Biome formatting applies.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Character with empty `talents`/`constellations`, or missing `promote`:** tabs render an empty state and don't crash. Test in Task 7.
2. **Talent text with unknown tags, unclosed `<color>`, or `{paramN}` beyond `params` length:** plain text renders and nothing throws. Test in Task 4.
3. **Filter combination with zero matches:** the strip shows an empty message, and `/characters` with no match doesn't redirect-loop. Test in Task 6.
4. **Detail id not in the list:** e.g. stale link `/characters/nope`. Not-found state, strip still usable. Test in Task 6.
5. **Skill icon 404 upstream, or the same icon shared by two characters in one run:** counted as missing / uploaded once. No failure, no duplicate rows. Test in Task 2.

---

### Task 1: `skill_icon` media owner type

**Files:**
- Modify: `packages/db/src/schema.ts`, `apps/api/src/media/sync-media.ts` (`MediaOwner.type`), `apps/api/src/routes/media.ts` (`ownerType` param)
- Create: `packages/db/migrations/0002_*.sql` (generated)
- Test: `packages/db/src/schema.test.ts`

**Interfaces:**
- Produces: `mediaOwnerTypeEnum` values `'character' | 'weapon' | 'material' | 'skill_icon'`. `MediaOwner = { type: (typeof mediaAssets.$inferSelect)['ownerType']; id: string }`. `loadMedia` accepts that union.

- [ ] **Step 1: Failing test.** In `schema.test.ts`, `it('accepts skill_icon media owned by icon name')` inserts `{ ownerType: 'skill_icon', ownerId: 'Skill_A_01', kind: 'icon', ... }` and expects one row.
- [ ] **Step 2:** Run `pnpm vitest run packages/db`. Expect it to FAIL: invalid enum value.
- [ ] **Step 3:** Add `'skill_icon'` to the enum and run `pnpm --filter @gi/db db:generate`. The SQL must be `ALTER TYPE "public"."media_owner_type" ADD VALUE 'skill_icon';`. Widen the two TS types.
- [ ] **Step 4:** Run `pnpm vitest run packages/db apps/api`. Expect PASS.
- [ ] **Step 5:** Commit `feat(db): skill_icon media owner type`.

### Task 2: Sync skill icons

**Files:**
- Modify: `apps/api/src/sync/source.ts`, `apps/api/src/sync/amber/amber-source.ts`, `apps/api/src/sync/run-sync.ts`
- Test: `apps/api/src/sync/amber/amber-source.test.ts`, `apps/api/src/sync/run-sync.test.ts`

**Interfaces:**
- Produces: `CharacterRecord.skillIcons: { name: string; url: string }[]`. The list is unique by name, in first-seen order: talents, then constellations, taken from the en detail.

- [ ] **Step 1: Failing tests.**
  - **amber-source:** for Nahida (`10000073`), expect `c.skillIcons.length > 0`, names unique, every `url === \`https://gi.yatta.moe/assets/UI/${name}.png\``, and a name starting `Skill_S_` and one starting `UI_Talent_` both present.
  - **run-sync:**
    - Two fake characters both list `{ name: 'Skill_A_01' }`, and one also lists `{ name: 'Skill_404' }` whose fetch returns 404. After the run, `mediaAssets` has exactly one row with `ownerType 'skill_icon', ownerId 'Skill_A_01'`, none for `Skill_404`, and the run status is `'succeeded'`.
    - Update the `char()` fixture to `skillIcons: []` by default.
- [ ] **Step 2:** Run `pnpm vitest run apps/api/src/sync`. Expect FAIL.
- [ ] **Step 3: Implement.**
  - Collect the names in `getCharacter` (talent and constellation `icon` strings, skipping empty ones).
  - In `syncEntity`, after the owner's `syncMedia`, call `syncMedia(mediaDeps, { type: 'skill_icon', id: name }, [{ kind: 'icon', url }], { force: full })` for each skill icon, when the record has `skillIcons`.
  - Concurrent identical uploads are safe: same key, and `onConflictDoUpdate`.
- [ ] **Step 4:** Run `pnpm vitest run apps/api`. Expect PASS.
- [ ] **Step 5:** Commit `feat(sync): store talent and constellation icons in R2`.

### Task 3: `skillIcons` in character detail

**Files:**
- Modify: `apps/api/src/routes/characters.ts`
- Test: `apps/api/src/routes/routes.test.ts`

**Interfaces:**
- Produces: `GET /v1/characters/:id` adds `skillIcons: Record<string, string>` (icon name → absolute URL), only for names referenced in `details`.

- [ ] **Step 1: Failing test** `it('maps referenced skill icons to urls')`. Seed details `{ talents: [{ icon: 'Skill_A_01' }], constellations: [{ icon: 'UI_Talent_X' }] }` plus `skill_icon` media rows for `Skill_A_01` and `Unrelated`. Expect `skillIcons` to equal `{ Skill_A_01: 'http://media.test/gi-media/skill_icon/Skill_A_01/icon.webp' }`, i.e. no `UI_Talent_X` (no row) and no `Unrelated`.
- [ ] **Step 2:** Run `pnpm vitest run apps/api/src/routes`. Expect FAIL.
- [ ] **Step 3:** Extract icon names from `details` defensively (arrays of objects with a string `icon`). Then `loadMedia(db, store, 'skill_icon', names)` and flatten `.icon`.
- [ ] **Step 4:** Run the tests. Expect PASS.
- [ ] **Step 5:** Commit `feat(api): skillIcons in character detail`.

### Task 4: Game text rendering

**Files:**
- Create: `apps/web/src/lib/game-text.ts`, `apps/web/src/components/GameText.tsx`
- Test: `apps/web/src/lib/game-text.test.ts`

**Interfaces:**
- Produces:
  - `type TextToken = { text: string; color?: string; italic?: boolean } | { br: true }`
  - `tokenizeGameText(s: string): TextToken[]`
  - `formatParamRow(row: string, params: number[]): { label: string; value: string } | null`
  - `<GameText text={string} />`

- [ ] **Step 1: Failing tests.**
  - `tokenizeGameText('a <color=#FFD780FF>b</color>\\nc <i>d</i>')` → `[{text:'a '},{text:'b',color:'#FFD780FF'},{br:true},{text:'c '},{text:'d',italic:true}]`. Note: the input contains a backslash and an `n` as two characters.
  - A real newline also gives `{br:true}`.
  - `{LINK#N123}x{/LINK}` → `x`.
  - `<foo>y</foo>` → `y`.
  - Unclosed `<color=#FFF>z` → text `z` (coloured or not, no throw).
  - **`formatParamRow`:**
    - `('Skill DMG|{param1:P}', [1.304])` → `{label:'Skill DMG', value:'130%'}`
    - `('1-Hit DMG|{param1:F1P}', [0.367392])` → `'36.7%'`
    - `('Duration|{param3:F1}s', [0,0,30])` → `'30.0s'`
    - `('CD|{param1:I}', [4.6])` → `'5'`
    - `('A|{param1:F2P}+{param2:F2P}', [0.1, 0.2])` → `'10.00%+20.00%'`
    - `('', [])` → `null`
    - `('X|{param9:P}', [1])` → value `''` for the missing param, no throw.
- [ ] **Step 2:** Run `pnpm vitest run apps/web/src/lib`. Expect FAIL.
- [ ] **Step 3: Implement.**
  - The tokenizer is a single regex scanner over `<color=...>`, `</color>`, `<i>`, `</i>`, other `<...>`, `{LINK#...}`, `{/LINK}`, `\\n` and `\n`, with a style stack.
  - `GameText` maps tokens to `<span style={{color}}>` / `<em>` / `<br/>`.
- [ ] **Step 4:** Run the tests. Expect PASS.
- [ ] **Step 5:** Commit `feat(web): game text tokenizer and param formatter`.

### Task 5: Locale and UI strings

**Files:**
- Create: `apps/web/src/i18n/locale.ts`, `apps/web/src/i18n/strings.ts` (en, ru, zh-CN dictionaries plus zh-TW), `apps/web/scripts/gen-zh-tw.mjs`
- Modify: `apps/web/package.json` (devDependency `opencc-js`, script `i18n:zh-tw`)
- Test: `apps/web/src/i18n/i18n.test.ts`

**Interfaces:**
- Produces:
  - `resolveLocale(search: string | undefined, navigatorLanguages: readonly string[]): Locale`
  - `useLocale(): Locale` (reads `?locale=` from the router search and `navigator.languages`)
  - `t(locale: Locale, key: StringKey): string`
  - `regionLabel(locale, raw: string | null): string`
  - `type StringKey = keyof typeof zhCN`

**Keys:**
- tabs: `tab.attributes`, `tab.talents`, `tab.constellations`, `tab.profile`
- talent types: `talent.normal`, `talent.skill`, `talent.burst`, `talent.passive`
- filters: `filter.open`, `filter.element`, `filter.weapon`, `filter.rarity`, `filter.clear`, `filter.empty`
- profile: `profile.region`, `profile.birthday`, `profile.release`
- other: `level`, `notFound`, `retry`, `loadError`, `placeholder`
- one `element.*` per element, one `weapon.*` per weapon type, one `region.*` each for MONDSTADT, LIYUE, INAZUMA, SUMERU, FONTAINE, NATLAN, SNEZHNAYA

- [ ] **Step 1: Failing tests.**
  - **`resolveLocale`:**
    - `('ru', [])` → `'ru'`
    - `(undefined, ['zh-HK'])` → `'zh-TW'`
    - `(undefined, ['zh'])` → `'zh-CN'`
    - `(undefined, ['ru-RU','en'])` → `'ru'`
    - `('xx', ['de'])` → `'en'`
  - **Dictionaries:** every dictionary has exactly the zh-CN key set.
  - **zh-TW:** `zhTW['tab.talents']` equals the OpenCC cn→tw of `zhCN['tab.talents']`.
  - **`regionLabel`:** `('en','MONDSTADT')` → `'Mondstadt'`; `('en','UNKNOWNLAND')` → `'Unknownland'`; `('en', null)` → `''`.
- [ ] **Step 2:** Run `pnpm vitest run apps/web/src/i18n`. Expect FAIL.
- [ ] **Step 3: Implement.**
  - Write zh-CN, then en and ru.
  - `gen-zh-tw.mjs` converts zh-CN to `strings.zh-TW.ts` (a generated file, committed).
  - Run the script, then hand-check the output.
- [ ] **Step 4:** Run the tests. Expect PASS.
- [ ] **Step 5:** Commit `feat(web): locale resolver and UI strings`.

### Task 6: Characters layout route: strip, filters, background, header

**Files:**
- Create: `apps/web/src/characters/queries.ts`, `apps/web/src/characters/details.ts`, `apps/web/src/routes/characters.tsx` (layout), `apps/web/src/routes/characters.index.tsx` (redirect), `apps/web/src/routes/characters.$id.tsx` (detail, panel placeholder until Task 7), `apps/web/src/characters/CharacterStrip.tsx`, `apps/web/src/characters/FilterOverlay.tsx`, `apps/web/src/characters/CharacterBackdrop.tsx`, `apps/web/src/characters/characters.module.css`
- Test: `apps/web/src/characters/characters.test.tsx`

**Interfaces:**
- Produces:
  - **Queries:** `charactersListQuery(locale)` (queryKey `['characters', locale]`) and `characterDetailQuery(id, locale)` (queryKey `['character', id, locale]`), both `staleTime: 5 * 60_000`, using `api.v1.characters.$get` / `api.v1.characters[':id'].$get`. A detail 404 resolves to `null`.
  - **`characterSearch`** (validator for `element?`, `weaponType?`, `rarity?`, `locale?`). Invalid values are dropped, not thrown.
  - **`filterCharacters(items, search)`**
  - **`parseCharacterDetails(details: unknown): { talents: Talent[]; constellations: Constellation[] }`**
    - `Talent = { name; icon; type: number; description; promote: Record<string, { level: number; params: number[]; description: string[] }> }`
    - `Constellation = { name; icon; description }`
    - Malformed entries are dropped.
  - **`talentKind(t): 'normal' | 'skill' | 'burst' | 'passive' | null`**: by icon prefix `Skill_A_` / `Skill_S_` / `Skill_E_`, else `type === 2` → passive.

- [ ] **Step 1: Failing tests.** Render the real `routeTree` with `createMemoryHistory` and a fresh `QueryClient`, mocking `../api`.
  - `/characters` redirects to `/characters/<first id>`.
  - `/characters?element=dendro` redirects to the first dendro id and keeps `element=dendro`.
  - With `element=dendro&rarity=1`, the strip shows `t('en','filter.empty')` and no redirect happens: the URL stays `/characters`.
  - `/characters/nope` (detail mock returns 404) shows `notFound` and the strip links are still present.
  - Clicking a strip link changes the header name and keeps the search params.
  - The filter overlay toggles element chips into the URL and closes on Escape.
  - Unit: `talentKind` cases, and `parseCharacterDetails` dropping `{}` and non-arrays.
- [ ] **Step 2:** Run `pnpm vitest run apps/web/src/characters`. Expect FAIL.
- [ ] **Step 3: Implement.**
  - The layout loader uses `ensureQueryData(charactersListQuery)`, and the `$id` loader prefetches detail.
  - **Strip:** a vertical column on ≥768px and a horizontal bottom row below that.
    - CSS `overflow: auto; scroll-snap-type: y mandatory` (x on mobile), `overscroll-behavior: contain`.
    - Pointer-drag handler sets `scrollTop`/`scrollLeft` (mouse pointerType only).
    - Edge bounce: a translate of up to 24px while dragging past the ends, released with a CSS transition.
    - The active item calls `scrollIntoView({ block: 'nearest' })`.
    - Prefetch detail on `onMouseEnter` / `onFocus`.
  - **Backdrop:** `gacha_splash` behind a cross-fade (two layered imgs, opacity transition), with an element-colour gradient (`var(--color-<element>)`) underneath.
  - **Header:** name · title, rarity stars in `var(--color-rarity-N)`, `GenshinIcon` for element and weapon.
  - **Reserved 3D slot:** `<div data-slot="viewer3d" />`, positioned under the panel, empty.
  - Add the `/characters` link nowhere else yet (home is step 6).
- [ ] **Step 4:** Run `pnpm vitest run apps/web` and `pnpm --filter @gi/web build`. Expect PASS.
- [ ] **Step 5:** Commit `feat(web): characters layout, strip, filters and backdrop`.

### Task 7: Detail panel tabs and the phone sheet

**Files:**
- Create: `apps/web/src/characters/DetailPanel.tsx`, `apps/web/src/characters/tabs/{Attributes,Talents,Constellations,Profile}.tsx`
- Modify: `apps/web/src/routes/characters.$id.tsx`, `characters.module.css`
- Test: `apps/web/src/characters/panel.test.tsx`

**Interfaces:**
- Consumes: Tasks 4–6 helpers, and `skillIcons` from Task 3.

- [ ] **Step 1: Failing tests.** Use the real Albedo detail captured as fixture `apps/web/src/characters/__fixtures__/albedo-en.json` (`curl` from production).
  - **Talents tab:**
    - It lists 7 talents.
    - The first shows `t('en','talent.normal')`, "Abiogenesis: Solar Isotoma" shows `talent.skill`, and "Calcite Might" shows `talent.passive`.
    - Selecting level 2 changes a scaling value.
    - Description has no raw `<color` text.
  - **Constellations:** 6 items.
  - **Profile:** shows `Mondstadt` and a localized birthday containing `13`.
  - **Attributes:** shows the placeholder marker.
  - **Empty data:** details `{ talents: [], constellations: [] }` renders empty states without throwing.
  - **Missing icon:** a missing `skillIcons` entry renders the neutral placeholder `<span data-icon-missing>`.
- [ ] **Step 2:** Run `pnpm vitest run apps/web/src/characters/panel.test.tsx`. Expect FAIL.
- [ ] **Step 3: Implement.**
  - **Tabs:** `role="tablist"` buttons; the active tab is kept in component state.
  - **Level select:** `<select>` 1–15, limited to the levels that exist in `promote`.
  - **Birthday:** `Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric' })`. **Release:** `dateStyle: 'medium'`.
  - **Phone (<768px):**
    - The panel is a fixed bottom sheet: a native scroll container with `scroll-snap-type: y mandatory` and two snap targets (collapsed ≈ 30vh showing header and tabs, expanded ≈ 85vh).
    - No JS drag.
  - **Loading state:** a skeleton panel.
  - **Error state:** `loadError` + a `retry` button that calls `refetch`.
- [ ] **Step 4:** Run `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm --filter @gi/web build`. Expect all green.
- [ ] **Step 5:** Commit `feat(web): character detail panel tabs and phone sheet`.

### Task 8: Docs, local check, deploy

- [ ] **Step 1: README.** Document `?details=1` re-sync after deploys that add media kinds, and `pnpm --filter @gi/web i18n:zh-tw`.
- [ ] **Step 2: Local manual check.** Run `pnpm --filter @gi/web dev` with `VITE_API_URL` set to production. Check desktop at 1440px and phone at 375px in the browser: strip scroll and drag, filters, all tabs, ru and zh-CN locales.
- [ ] **Step 3: Deploy (with the user's go-ahead).**
  - Push `remake`. The Railway api picks it up and runs migration 0002 pre-deploy.
  - `POST /admin/sync?details=1`.
  - Verify the Albedo detail has a non-empty `skillIcons` and that one icon URL returns 200 `image/webp`.
  - Vercel preview/prod for `remake` builds. Verify `/characters/10000038` loads.
- [ ] **Step 4:** Commit `docs: characters browser notes`.

---

## Revision: legacy layout (Tasks 9–12)

The user rejected the T6/T7 presentation (side strip, sheet, tab bar). The spec's "Screen (revised: legacy layout)" section now governs. Task 8 (manual check and README) moves to Task 12. The routes, queries, details helpers, game-text, i18n and skill-icon sync are kept. `CharacterStrip`, `FilterOverlay`, `DetailPanel`, `CharacterHeader`, `CharacterBackdrop` and the sheet CSS are replaced.

Legacy reference: `git show master:src/components/CharacterUI/...`. Port the values from the spec section; don't copy the SCSS wholesale.

### Task 9: namecard media

**Files:**
- `packages/db/src/schema.ts` and a new migration: `media_kind` gains `'namecard'`.
- `apps/api/src/sync/amber/amber-source.ts`: when `other.nameCard.icon` matches `UI_NameCardIcon_<X>`, add `{ kind: 'namecard', url: ASSET_BASE + '/namecard/UI_NameCardPic_<X>_P.png' }`.
- Tests in `amber-source.test.ts`, covering a nameCard present and one missing.

The list and detail routes already expose every media kind by name; a route test asserts `media.namecard`.

**Done when:**
- `pnpm vitest run packages/db apps/api` is green, and lint and typecheck are green.
- Commit `feat(api): sync character namecards`.

### Task 10: legacy shell (background, top bar, menu, bottom buttons, selection panel)

**Search:** `characterSearch` gains `section: 'attributes'|'weapon'|'artifacts'|'constellation'|'talents'|'profile'`. Invalid values are dropped.

**Components in `apps/web/src/characters/`:**
- `LegacyBackground` (namecard plus splash cross-fade, element-gradient fallback)
- `TopBar` (element glyph with "Element/Name", `AvatarStrip`, close link to `/`)
- `SectionMenu` (rhombus list of Links that set `section`)
- `BottomButtons` (grid and hide)
- `SelectionPanel` (heading, avatar grid, filters with chips; Escape closes it)

**Layout `routes/characters.tsx`:**
- Composes the components above.
- Holds the `selectionOpen` and `uiHidden` state.
- The `$id` route renders the right panel.

**Strings:** add `section.*`, `selection.title`, `button.selection`, `button.hide`, `button.show`, `close`, `stat.stamina`, `details`, `friendship`, `wardrobe` in all four locales, with zh-TW generated.

**Tests** (rewrite `characters.test.tsx` route tests on the new UI):
- the redirect, filtered redirect, empty and not-found tests are kept;
- the strip switch keeps the search;
- the filters live in the selection panel (the grid button opens it, a chip writes the URL, Escape closes it);
- the menu sets `section`, and the section survives a character switch;
- hide removes the menu and panel, and show restores them;
- invalid `section` is dropped.

**Done when:** `pnpm vitest run apps/web` is green, typecheck, lint and build are green, and the work is committed.

### Task 11: right panel sections and detail modal

**`RightPanel` in `apps/web/src/characters/`:**
- **attributes:** name, stars, level bar, 5 stats as "—", a Details modal ("No data yet"), Friendship 10, description, disabled Wardrobe;
- **weapon / artifacts:** placeholder;
- **talents / constellation:** a list of buttons that open `DetailModal`, which renders the game text and, for talents with `promote`, the level select and scaling `dl`;
- **profile.**

**Modal:** `role="dialog"`, closes on Escape, the close button or a backdrop click.

**Tests:** rewrite `panel.test.tsx` and keep its assertions (kinds, no raw markup, 36.7% to 39.7% at level 2, icon versus placeholder, 6 constellations, profile, empty details). They now go through list item buttons and the modal.

**Done when:** tests, typecheck, lint and build are green, and the work is committed.

### Task 12: phone layout, theme fix, manual check, README

1. **Theme:** `@theme static` in `theme.css`, so `var(--color-*)` resolves at runtime.
2. **Phone layout** per the spec.
3. **Manual check** against production data at 1440 and 375 widths, plus ru and zh-CN. Compare against the legacy screenshot.
4. **README:** the `?details=1` re-sync, the `i18n:zh-tw` script, and removing the stale Railway text.
5. **Commit.**
