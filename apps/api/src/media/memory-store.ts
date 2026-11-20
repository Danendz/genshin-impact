import type { MediaStore } from './store'

export function createMemoryStore(
  publicBase = 'http://memory.test',
): MediaStore & {
  keys(): string[]
  get(key: string): { body: Uint8Array; contentType: string } | undefined
} {
  const objects = new Map<string, { body: Uint8Array; contentType: string }>()
  return {
    async exists(key) {
      return objects.has(key)
    },
    async put(key, body, contentType) {
      objects.set(key, { body, contentType })
    },
    async list(prefix) {
      return [...objects.keys()].filter((k) => k.startsWith(prefix))
    },
    async delete(key) {
      objects.delete(key)
    },
    get: (key: string) => objects.get(key),
    publicUrl: (key) => `${publicBase.replace(/\/+$/, '')}/${key}`,
    keys: () => [...objects.keys()],
  }
}
