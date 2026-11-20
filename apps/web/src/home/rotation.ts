export const ROTATE_MS = 8000

/** A random index other than `current` (when there is another to pick). */
export function pickNext(
  count: number,
  current: number | undefined,
  rand: () => number,
): number {
  if (count <= 1) return 0
  if (current === undefined) return Math.floor(rand() * count)
  const i = Math.floor(rand() * (count - 1))
  return i >= current ? i + 1 : i
}
