# apps/web

React 19, Vite 8, TanStack Router (file routes) and TanStack Query 5, Tailwind 4 with CSS modules, Vitest 5 with Testing Library and jsdom. The app rebuilds the 2022 Vue site, so layouts and values follow the legacy SCSS on the `legacy` branch. Comments name the legacy source when a value comes from there.

## Layout

```
src/
  api.ts            hc<AppType>(VITE_API_URL): the only API client
  router.tsx        router + QueryClient; router context = { queryClient }
  routes/           file routes (routeTree.gen.ts is generated; never edit it)
  <feature>/        home/, characters/: components, queries.ts, pure logic, *.module.css, tests
  components/       cross-feature UI (GenshinIcon, GameText, layers.ts focus/escape hooks)
  lib/              pure helpers (storage, game-text)
  i18n/             locale resolution + string dictionaries
  styles/theme.css  Tailwind @theme tokens (colors, durations, shadows)
  test/             setup + renderInRouter helper
```

Organise by feature, not by kind. A new screen gets its own folder: `src/<feature>/`.

## Data fetching

- Every request goes through the typed `api` client from `src/api.ts`. Don't use `fetch` with hand-written URLs.
- Each feature defines its queries in `<feature>/queries.ts` as `queryOptions` factories. Keys are arrays starting with the resource, then its params (`['character', id, locale]`), and every key includes `locale`. Response types come from `InferResponseType<typeof api.v1.x.$get, 200>`. Don't redeclare them by hand.
- A `queryFn` checks `res.ok` and throws `Error('<what>: HTTP <status>')`. A 404 that means "doesn't exist" resolves to `null` instead of throwing.
- Loaders go through the query cache: `context.queryClient.ensureQueryData(...)` when the route needs the data before it renders, or `void prefetchQuery(...)` when the component shows a skeleton. Components read with `useSuspenseQuery` (data was ensured) or `useQuery` (pending, error, null or data, each handled).
- `loaderDeps` must include the resolved locale (`browserLocale(search.locale)`), so a language change refetches.

## Routing and search params

- Routes live in `src/routes/` as `createFileRoute` files. The route file is thin and imports feature components.
- Search params are validated by a plain function (`characterSearch`) used as `validateSearch`. Lists are serialised comma-joined by the router's custom `stringifySearch` (see `router.tsx`). Keep values free of commas.
- Use `Link`, `redirect` and `navigate` with typed `to` and `params`. Don't build URLs by hand.

## i18n

- Locales: `en`, `ru`, `zh-CN`, `zh-TW` (from `@gi/shared`). Use `useLocale()` in components and `browserLocale()` in loaders.
- Every user-facing string goes through `t(locale, key)`. When you add a key, add it to `strings.en.ts`, `strings.ru.ts` and `strings.zh-CN.ts` by hand, then run `pnpm --filter @gi/web i18n:zh-tw` to regenerate `strings.zh-TW.ts`. Never edit zh-TW by hand.
- Game text from the API (talent descriptions and so on) renders through `GameText` / `lib/game-text`.

## Styling

- Design tokens live in `styles/theme.css` under `@theme`. Use them (`var(--color-gold)`, `bg-night`). Don't add raw hex values in components.
- **CSS modules** (`<feature>.module.css`) hold component layout and anything stateful or legacy-derived. **Tailwind utilities** handle small one-off spacing and typography in JSX. Don't recreate a module's layout with long utility strings.
- Express state with data attributes (`data-status="active"`, `data-selection`, `data-visible`) and select on them in CSS. Don't use conditional class names.
- Animations use the duration tokens (`--dur-*`). Reduced motion is handled in CSS.
- Phones (< 768px) get a stacked variant inside the same module.
- Use `overflow: clip` rather than `hidden` on full-screen containers. A comment in `characters.module.css` explains why.

## Components and state

- Use function components with props typed inline. Export named components, never default exports.
- Server state belongs to TanStack Query. URL state (filters, section, locale) belongs to search params. Local UI state uses `useState`. Persistent prefs go through `lib/storage` (`readStored` / `writeStored`, which never throw). There is no global store.
- Keep effects minimal. For external stores use `useSyncExternalStore` (see `i18n/locale.ts`). Keep pure logic (filtering, rotation, parsing) in plain `.ts` files and unit-test it.
- Accessibility: interactive things are `<button type="button">` or `Link`. Modals and overlays use `useModalLayer` / `useEscape` from `components/layers.ts`. Images get meaningful `alt` text, or `alt=""` when decorative.
- Images that cross-fade must wait for `onLoad` before showing (see `home/Background.tsx`).

## Tests

- Test files sit next to the code as `*.test.ts(x)`.
- Mock the API at the module boundary with `vi.mock('../api', …)` and `respond(status, body)` helpers. Don't mock fetch.
- Render routed UI with `renderInRouter` from `src/test/`, or with `makeRouter` and a memory history for full-route tests. Use `testClient()` (retries off).
- Query by role and label first, `data-testid` only as a last resort. Assert what the user sees.
- Run: `pnpm vitest run --project web`.

## Env

- `VITE_API_URL` is required. It comes from the repo-root `.env` (Vite `envDir` is the root).
- To run against the prod API locally, prod CORS rejects localhost, so use a Vite proxy config that sends `/v1` to the prod API with `VITE_API_URL=http://localhost:5173`. Keep that config out of git.

## Don'ts

- Don't edit `routeTree.gen.ts`, `strings.zh-TW.ts`, or anything under `assets/icons`.
- Don't add a state library, CSS-in-JS, a UI kit or a date library without asking.
- Don't hardcode English strings in JSX.
- Don't fetch inside `useEffect`.
