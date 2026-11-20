import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import styles from '../characters/characters.module.css'
import { characterSearch } from '../characters/details'
import { characterDetailQuery } from '../characters/queries'
import { RightPanel } from '../characters/RightPanel'
import { browserLocale, useLocale } from '../i18n/locale'
import { t } from '../i18n/strings'

export const Route = createFileRoute('/characters/$id')({
  loaderDeps: ({ search }) => ({ locale: browserLocale(search.locale) }),
  // not awaited: the panel shows its skeleton while the detail loads
  loader: ({ context, params, deps }) => {
    void context.queryClient.prefetchQuery(
      characterDetailQuery(params.id, deps.locale),
    )
  },
  component: CharacterPage,
})

function CharacterPage() {
  const { id } = Route.useParams()
  const locale = useLocale()
  const section = characterSearch(Route.useSearch()).section ?? 'attributes'
  const q = useQuery(characterDetailQuery(id, locale))
  return (
    <aside className={styles.right}>
      {q.isPending ? (
        <div className={`${styles.card} h-72 animate-pulse`} />
      ) : q.isError ? (
        <div className={`${styles.card} flex items-center gap-3`}>
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
        <p role="status" className={styles.card}>
          {t(locale, 'notFound')}
        </p>
      ) : (
        <RightPanel
          key={id}
          detail={q.data}
          section={section}
          locale={locale}
        />
      )}
    </aside>
  )
}
