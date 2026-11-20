import type { MediaStore } from './store'

export function createMemoryStore(
  publicBase = 'http://memory.test',
): MediaStore & { keys(): string[] } {
  const objects = new Map<string, { body: Uint8Array; contentType: string }>()
  return {
    async exists(key) {
      return objects.has(key)
    },
    async put(key, body, contentType) {
      objects.set(key, { body, contentType })
    },
    publicUrl: (key) => `${publicBase.replace(/\/+$/, '')}/${key}`,
    keys: () => [...objects.keys()],
  }
}
