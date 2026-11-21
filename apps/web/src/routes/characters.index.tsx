import { createFileRoute, redirect } from '@tanstack/react-router'
import { characterSearch, filterCharacters } from '../characters/details'
import { charactersListQuery } from '../characters/queries'
import { browserLocale } from '../i18n/locale'

/** /characters opens the first character of the (filtered) list */
export const Route = createFileRoute('/characters/')({
  loaderDeps: ({ search }) => ({
    search: characterSearch(search),
    // the resolved language, so a saved pick changes the cache key
    locale: browserLocale(search.locale),
  }),
  loader: async ({ context, deps }) => {
    const items = await context.queryClient.ensureQueryData(
      charactersListQuery(deps.locale),
    )
    const first = filterCharacters(items, deps.search)[0]
    if (first)
      throw redirect({
        to: '/characters/$id',
        params: { id: first.id },
        search: deps.search,
        replace: true,
      })
  },
  // no match: the layout's strip shows the empty-filter message
  component: () => null,
})
