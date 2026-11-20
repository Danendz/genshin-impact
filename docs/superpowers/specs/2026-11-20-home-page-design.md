# Home Page — Design

Part of delivery step 6 of [`docs/specs/2026-11-19-remake-design.md`](../../specs/2026-11-19-remake-design.md), pulled forward. Branch `remake`.

## Intent

`/` is still the scaffold's API health check. When `remake` merges to `master`, it replaces the live legacy site, and `/` is the first thing a visitor sees. The home page must be in place before that merge. It rebuilds the legacy 2022 home screen (the in-game Paimon menu), so the site looks finished at cutover and visitors reach the characters browser from it.

## Goals

- `/` in `apps/web` reproduces the legacy home screen:
  - rotating background art;
  - the top-left option icons;
  - the profile card;
  - the menu tile grid;
  - the settings panel.
- **Legacy parity for the profile** (the user's choice): it shows what legacy showed and does what legacy did. Nothing more.
- Tiles and icons for pages that don't exist yet are visibly locked.
- Works on phone widths, like the characters browser.

## Non-goals

- **Editable profile** (name, signature, birthday, namecard). That stays in step 6. Legacy's edit buttons never worked; here they are shown locked.
- **The step-6 profile store** (Zustand plus persistence for profile, primogems and pity). Step 6 replaces this page's small browser-storage profile.
- **Pages behind locked tiles:** Wish, Inventory, Events and the rest.
- **The Vercel cutover.** It is a separate action the user approves.
- **Any API or database change.** Everything the page needs is already served.

## Anti-goals

- A tile that navigates to a blank or 404 page.
- Images bundled into the web app that the API already serves from R2. Static UI icons already in `apps/web/src/assets/icons` are fine.
- A landing page that is not the legacy home screen, such as a hero section or a marketing page.

## Approaches considered

**1. Build it in `apps/web` with the existing stack (picked).**
- Uses React, TanStack Router and Query, and CSS Modules, as the characters browser does.
- Data comes from endpoints that already exist:
  - `/v1/site/home-backgrounds` for the background art;
  - `/v1/characters` for avatar icons and namecards. The list items already carry `media.icon` and `media.namecard`.
- Profile state lives in browser storage.

**2. Bundle the avatar, namecard and background images into the web app.** Rejected: it duplicates media the API already serves from R2.

**3. Build the step-6 profile store and editing now.** Rejected: the user chose legacy parity (option A) over a fully editable profile (option B).

## Design

The legacy source of truth is `master`, with a copy at `scratchpad/legacy/src`:
- `components/HomeUI/**`
- `assets/Styles/HomeUI/*.scss`
- `assets/Data/home_menu.json`
- `store/Home/UserData.ts`
- `i18n/translations/Home/locales/*.json`

Match its layout, sizes, colours and animations. The live legacy site is genshin-impact-vue.vercel.app.

### Layout

**Background**
- A full-screen image chosen at random from `/v1/site/home-backgrounds`.
- Every 8 s it crossfades to another image, never the same one twice in a row.
- Preload the next image before fading to it.
- While the list loads, or if it fails, show a dark background. The rest of the page still renders.

**Option icons (top-left)**

| Icon | Behaviour |
|---|---|
| Camera | locked |
| Bulletin | locked |
| Mail | locked |
| Clock | locked |
| Settings | opens the settings panel |

**Main section** has two parts:
- the profile card;
- the navigation tile grid.

**Entry animations**
- The options and main section slide in on load, as in legacy.
- Legacy picks the animation direction by screen orientation (`landscape`/`portrait`). Keep that.
- Respect `prefers-reduced-motion`, as the characters browser does.

### Profile card (legacy parity)

The card shows:
- the namecard banner: Diona's namecard (`10000039`);
- the round avatar: Raiden Shogun's icon (`10000052`) by default;
- `UID <n>` with a **Copy** button. It copies the UID to the clipboard and shows a short "copied" popup.
- the name: "Introduce yourself to us!" (legacy's default is a typo, "Introduce yourself us!"; fix it). The edit button next to it is locked.
- the signature: "Say something to the world!" (legacy's default is a typo, "Say something world!"; fix it);
- Adventure Rank 57, with its info button locked;
- Adventure Exp `0 / <next-rank exp>`, as a progress bar with the `adventure` icon;
- World Level, computed from the rank as in legacy: AR ≤ 19 is 0, otherwise ⌊(AR − 20) / 5 + 1⌋. That gives 8 at AR 57.
- Birthday, shown as `—` when unset. Legacy printed `0/0`.

The exp table and `MAX_RANK = 60` come from legacy `UserData.ts`.

**Avatar picker**
- Clicking the avatar opens a modal, legacy `ChangeAvatar`. It has two parts:
  - a scrollable grid of every character's icon, from the same `/v1/characters` list;
  - a preview of the selected one with a confirm button.
- Confirming saves the chosen character id and updates the avatar.
- Close it with Escape, the backdrop, or a close button. Reuse the characters browser's `Modal`.

**Persistence**
- Saved under one localStorage key: `{ avatarId, uid }`.
- Profile text values are constants for now. Step 6 makes them editable.
- Storage access is wrapped in try/catch. With storage blocked, the page still works with defaults.
- An unknown saved `avatarId`, such as a character removed upstream, falls back to the default avatar.

**UID** (the executor's call; legacy showed `0`)
- A random 9-digit number, generated on first visit and saved.

### Navigation tiles

- The 19 tiles from legacy `home_menu.json`, in that order, with icons from `apps/web/src/assets/icons/home` and legacy captions.
- **Unlocked:**

  | Tile | Destination |
  |---|---|
  | Character Archive | `/characters` |
  | Character | `/characters` |

  Links carry the current `?locale=`.
- **Locked:** every other tile. Wish, Inventory and Events unlock when their pages ship.

### Locked state

Applies to tiles, option icons, the name edit button and the info buttons. The executor's call:
- The item is dimmed, with a small lock glyph.
- It is `aria-disabled` and has a "Coming soon" tooltip or title.
- Clicking it does nothing. It never navigates.
- One shared component or style handles every locked item.

### Settings panel

- Legacy `HomeSettings`, a full-screen panel:
  - a header with the settings icon, the title "Settings / Language" and a close button;
  - a rhombus section list on the left with one section, **Language**. Legacy's second section, "Other", only repeated the language list, so drop it.
  - the language options on the right.
- The options are the four supported locales: English, Русский, 简体中文 and 繁體中文.
- Picking one switches the UI language right away.
- Close it with the close button or Escape. The main section is hidden while the panel is open, and fades back in afterwards.

**Remembered language** (the executor's call)
- The chosen locale is saved in localStorage.
- `resolveLocale` order becomes:
  1. `?locale=`
  2. the saved locale
  3. the browser's languages
  4. `en`
- So the choice also applies on `/characters`. The characters browser already reads `useLocale()`, so it needs no other change.

### Strings

- Add the home UI strings (menu captions, profile labels, settings labels, "Coming soon", "copied", the avatar modal title and confirm) to all four locales in `apps/web/src/i18n`.
- Russian and English come from legacy's locale files. zh-CN is written by hand, then `pnpm i18n:zh-tw` generates zh-TW, the existing workflow.
- Character names in the avatar picker come from the API in the current locale.

### Data and errors

- Two queries: the backgrounds and the character list. Share the character list query key with the characters browser, so going from home to `/characters` reuses the cache.
- If the character list fails, the default avatar and namecard can't render. Show neutral placeholders, keep the tiles usable, and disable the avatar picker.
- The health-check UI on `/` is removed. Its test (`routes/index.test.tsx`) is replaced by home page tests.

### Testing

Testing Library tests, following the characters browser's patterns, for:
- **Tiles:** Character and Character Archive link to `/characters` and keep `?locale=`. Every other tile is `aria-disabled`, and clicking it does not navigate.
- **Option icons:** only settings is enabled.
- **Profile:**
  - defaults render: AR 57, World Level 8, the exp text, a birthday of `—`;
  - the UID is 9 digits and stays the same after a remount;
  - Copy writes the UID to the clipboard.
- **Avatar picker:** opening it, selecting, and confirming change the avatar and save it. After a remount the new avatar persists. A stale saved id falls back to the default.
- **Settings:** picking Русский switches the visible strings and saves the choice. `resolveLocale` follows the new order, as unit tests.
- **Failures:** if the backgrounds or the character list fail, the page still renders the tiles.
- **Blocked storage:** with storage throwing, the page renders defaults.

## Left to the builder

- Component and file breakdown inside `apps/web/src/home/` (mirroring `src/characters/`).
- Exact CSS, ported from the legacy SCSS.
- The lock glyph's design.
- How the crossfade is implemented, within the 8 s cycle and the no-repeat rule.
