import { useSuspenseQuery } from '@tanstack/react-query'
import {
  createFileRoute,
  Outlet,
  useParams,
  useRouter,
} from '@tanstack/react-router'
import { CharacterBackdrop } from '../characters/CharacterBackdrop'
import { CharacterStrip } from '../characters/CharacterStrip'
import { characterSearch, filterCharacters } from '../characters/details'
import { FilterOverlay } from '../characters/FilterOverlay'
import { charactersListQuery } from '../characters/queries'
import { browserLocale, useLocale } from '../i18n/locale'
import { t } from '../i18n/strings'

export const Route = createFileRoute('/characters')({
  validateSearch: characterSearch,
  loaderDeps: ({ search }) => ({ locale: search.locale }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(
      charactersListQuery(browserLocale(deps.locale)),
    ),
  component: CharactersLayout,
  errorComponent: ListError,
})

function CharactersLayout() {
  const locale = useLocale()
  // the router passes unvalidated keys through next to validated ones
  const search = characterSearch(Route.useSearch())
  const { data } = useSuspenseQuery(charactersListQuery(locale))
  const { id } = useParams({ strict: false })
  const current = data.find((c) => c.id === id)

  return (
    <main className="relative h-dvh overflow-hidden bg-[#0d1018] text-white">
      <CharacterBackdrop
        splash={current?.media.gacha_splash}
        element={current?.element}
      />
      <div className="absolute top-4 left-4 z-20 md:left-28">
        <FilterOverlay search={search} locale={locale} />
      </div>
      <CharacterStrip
        items={filterCharacters(data, search)}
        activeId={id}
        locale={locale}
        className="absolute inset-x-0 bottom-0 z-20 bg-black/30 backdrop-blur-sm md:inset-x-auto md:top-0 md:left-0 md:max-h-dvh md:bg-transparent md:backdrop-blur-none"
      />
      <div data-slot="viewer3d" className="absolute inset-0 -z-0" />
      <Outlet />
    </main>
  )
}

function ListError() {
  const locale = useLocale()
  const router = useRouter()
  return (
    <main className="grid h-dvh place-items-center bg-[#0d1018] text-white">
      <div className="flex flex-col items-center gap-3">
        <p>{t(locale, 'loadError')}</p>
        <button
          type="button"
          className="rounded-full border border-white/40 px-4 py-1"
          onClick={() => router.invalidate()}
        >
          {t(locale, 'retry')}
        </button>
      </div>
    </main>
  )
}
