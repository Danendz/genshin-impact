/** A synced talent/constellation icon, or a neutral placeholder when it is not in R2 yet. */
export function SkillIcon({ url }: { url: string | undefined }) {
  const box =
    'size-11 shrink-0 rounded-full bg-[#3b4255] ring-1 ring-[#d3bc8e]/60'
  if (!url) return <span data-icon-missing className={box} aria-hidden />
  return <img src={url} alt="" loading="lazy" className={`${box} p-1`} />
}
