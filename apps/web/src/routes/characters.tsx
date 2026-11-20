import { useSuspenseQuery } from '@tanstack/react-query'
import {
  createFileRoute,
  Outlet,
  useParams,
  useRouter,
} from '@tanstack/react-router'
import { useCallback, useState } from 'react'
import { BottomButtons, ShowButton } from '../characters/BottomButtons'
import { CloseButton } from '../characters/CloseButton'
import styles from '../characters/characters.module.css'
import { characterSearch, filterCharacters } from '../characters/details'
import { LegacyBackground } from '../characters/LegacyBackground'
import { charactersListQuery } from '../characters/queries'
import { SectionMenu } from '../characters/SectionMenu'
import { SelectionPanel } from '../characters/SelectionPanel'
import { TopBar } from '../characters/TopBar'
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

/** The legacy character screen; the $id route fills the right-hand panel. */
function CharactersLayout() {
  const locale = useLocale()
  // the router passes unvalidated keys through next to validated ones
  const search = characterSearch(Route.useSearch())
  const { data } = useSuspenseQuery(charactersListQuery(locale))
  const { id } = useParams({ strict: false })
  const current = data.find((c) => c.id === id)
  const items = filterCharacters(data, search)
  const [selection, setSelection] = useState(false)
  const [hidden, setHidden] = useState(false)
  const closeSelection = useCallback(() => setSelection(false), [])
  return (
    <main
      className={styles.screen}
      data-selection={selection && !hidden ? '' : undefined}
    >
      <LegacyBackground
        namecard={current?.media.namecard}
        splash={current?.media.gacha_splash}
        element={current?.element}
      />
      <div data-slot="viewer3d" className="absolute inset-0" />
      {hidden ? (
        <ShowButton locale={locale} onShow={() => setHidden(false)} />
      ) : (
        <>
          {selection ? (
            // legacy: the top bar makes way; a back button sits over the right card
            <>
              <SelectionPanel
                items={items}
                activeId={id}
                search={search}
                locale={locale}
                onClose={closeSelection}
              />
              <CloseButton
                label={t(locale, 'back')}
                glyph="reply"
                onClick={closeSelection}
                className={styles.back}
              />
            </>
          ) : (
            <>
              <TopBar items={items} current={current} locale={locale} />
              <SectionMenu
                active={search.section ?? 'attributes'}
                locale={locale}
              />
              <BottomButtons
                locale={locale}
                onSelection={() => setSelection(true)}
                onHide={() => setHidden(true)}
              />
            </>
          )}
          <Outlet />
        </>
      )}
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
