import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { api } from '../api'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await api.health.$get()
      return (await res.json()).ok
    },
  })

  const status = health.isPending
    ? 'Checking API…'
    : health.data
      ? 'API online'
      : 'API offline'

  return (
    <main className="p-6">
      <h1 className="text-2xl">Genshin Impact</h1>
      <p>{status}</p>
    </main>
  )
}
