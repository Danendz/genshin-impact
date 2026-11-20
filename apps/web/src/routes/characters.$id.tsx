import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { CharacterHeader } from '../characters/CharacterHeader'
import { characterDetailQuery } from '../characters/queries'
import { browserLocale, useLocale } from '../i18n/locale'
import { t } from '../i18n/strings'

export const Route = createFileRoute('/characters/$id')({
  loaderDeps: ({ search }) => ({ locale: search.locale }),
  // not awaited: the page shows its skeleton while the detail loads
  loader: ({ context, params, deps }) => {
    void context.queryClient.prefetchQuery(
      characterDetailQuery(params.id, browserLocale(deps.locale)),
    )
  },
  component: CharacterPage,
})

function CharacterPage() {
  const { id } = Route.useParams()
  const locale = useLocale()
  const q = useQuery(characterDetailQuery(id, locale))

  return (
    <section className="pointer-events-none absolute inset-0 z-10 flex flex-col gap-6 px-4 pt-16 pb-28 md:pt-20 md:pr-6 md:pb-6 md:pl-32">
      <div className="pointer-events-auto">
        {q.isPending ? (
          <div className="h-24 w-64 animate-pulse rounded-xl bg-white/10" />
        ) : q.isError ? (
          <div className="flex items-center gap-3">
            <p>{t(locale, 'loadError')}</p>
            <button
              type="button"
              className="rounded-full border border-white/40 px-4 py-1"
              onClick={() => q.refetch()}
            >
              {t(locale, 'retry')}
            </button>
          </div>
        ) : !q.data ? (
          <p role="status">{t(locale, 'notFound')}</p>
        ) : (
          <CharacterHeader
            name={q.data.name}
            title={q.data.title}
            rarity={q.data.rarity}
            element={q.data.element}
            weaponType={q.data.weaponType}
            locale={locale}
          />
        )}
      </div>
    </section>
  )
}
