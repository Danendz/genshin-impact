// Reads files fetch_characters.py already downloaded (../models/characters), so
// the first bulk upload doesn't download 4 GB again. Layout:
//   <Folder>/source/<hash>, <Folder>/extras/<Outfit>/<hash>
//   <Folder>/media/<Group>/<Stem>.png (original) or .webp (preview)
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { cleanLabel, type SkowtAsset } from './skowt-client'

const HASH_RE = /^[0-9a-f]{32}$/

/** fetch_characters.py `folder_name` */
export const folderName = (name: string) =>
  name.replace(/[/\\:\0]/g, '-').replace(/^[. ]+|[. ]+$/g, '') || 'Unknown'

/** fetch_characters.py `media_group` */
export function mediaGroup(role: string): string {
  if (role.startsWith('sheet.')) return 'Character sheets'
  if (role.includes('namecard')) return 'Namecards'
  if (role.startsWith('icon.')) return 'Icons'
  if (/^(skill|constellation|passive)\./.test(role)) return 'Kit'
  if (/^(art|community)\./.test(role)) return 'Art'
  return 'Other'
}

/** fetch_characters.py `collect_media`: asset id -> `<Group>/<Stem>` */
export function mediaStems(
  characterName: string,
  files: SkowtAsset[],
): Map<string, string> {
  const out = new Map<string, string>()
  const used = new Set<string>()
  const prefix = `${characterName} · `
  for (const asset of files) {
    if (asset.extension === 'glb' || asset.hidden || !asset.id) continue
    const group = mediaGroup(asset.role ?? '')
    const raw = (asset.name ?? '').startsWith(prefix)
      ? (asset.name ?? '').slice(prefix.length)
      : (asset.name ?? '')
    const stem = cleanLabel(raw) || cleanLabel(asset.role ?? '') || asset.id
    let key = `${group}/${stem}`
    for (let n = 2; used.has(key.toLowerCase()); n++)
      key = `${group}/${stem} ${n}`
    used.add(key.toLowerCase())
    out.set(asset.id, key)
  }
  return out
}

export interface LocalCache {
  container(hash: string): Uint8Array | undefined
  image(
    characterName: string,
    files: SkowtAsset[],
    asset: SkowtAsset,
  ): { bytes: Uint8Array; original: boolean } | undefined
}

export function createLocalCache(dir: string): LocalCache {
  const containers = new Map<string, string>()
  const visit = (d: string, depth: number) => {
    for (const entry of readdirSync(d)) {
      const p = join(d, entry)
      const st = statSync(p)
      if (st.isDirectory()) {
        if (depth < 3 && !['decoded', 'export', 'media'].includes(entry))
          visit(p, depth + 1)
      } else if (HASH_RE.test(entry)) containers.set(entry, p)
    }
  }
  visit(dir, 0)
  const stems = new Map<string, Map<string, string>>()

  return {
    container(hash) {
      const p = containers.get(hash)
      return p ? new Uint8Array(readFileSync(p)) : undefined
    },
    image(characterName, files, asset) {
      let byId = stems.get(characterName)
      if (!byId) {
        byId = mediaStems(characterName, files)
        stems.set(characterName, byId)
      }
      const stem = byId.get(asset.id)
      if (!stem) return undefined
      const base = join(dir, folderName(characterName), 'media', stem)
      const original = `${base}.${asset.extension}`
      if (asset.extension && existsSync(original)) {
        return { bytes: new Uint8Array(readFileSync(original)), original: true }
      }
      if (existsSync(`${base}.webp`)) {
        return {
          bytes: new Uint8Array(readFileSync(`${base}.webp`)),
          original: false,
        }
      }
      return undefined
    },
  }
}
