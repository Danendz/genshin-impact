import { createFileRoute, redirect } from '@tanstack/react-router'
import { characterSearch, filterCharacters } from '../characters/details'
import { charactersListQuery } from '../characters/queries'
import { browserLocale } from '../i18n/locale'

/** /characters opens the first character of the (filtered) list */
export const Route = createFileRoute('/characters/')({
  loaderDeps: ({ search }) => characterSearch(search),
  loader: async ({ context, deps }) => {
    const items = await context.queryClient.ensureQueryData(
      charactersListQuery(browserLocale(deps.locale)),
    )
    const first = filterCharacters(items, deps)[0]
    if (first)
      throw redirect({
        to: '/characters/$id',
        params: { id: first.id },
        search: deps,
        replace: true,
      })
  },
  // no match: the layout's strip shows the empty-filter message
  component: () => null,
})
