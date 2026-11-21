export const LOCALE_KEY = 'gi.locale'
export const PROFILE_KEY = 'gi.profile'

/** A JSON value from localStorage, or undefined when missing, blocked or rejected by `parse`. */
export function readStored<T>(
  key: string,
  parse: (raw: unknown) => T | undefined,
): T | undefined {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? undefined : parse(JSON.parse(raw))
  } catch {
    return undefined
  }
}

/** Saves a JSON value; blocked or full storage is ignored. */
export function writeStored(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {}
}
