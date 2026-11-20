import sharp from 'sharp'
import type { SiteFile } from './seed-site-assets'

/**
 * Keep only decodable images. Hidden files (.DS_Store, ...) are dropped by
 * name; everything else is probed with sharp, so extensionless webp (the
 * legacy backgrounds) is accepted while stray non-images are logged and skipped.
 */
export async function filterImageFiles(
  files: SiteFile[],
  log: (msg: string) => void = () => {},
): Promise<SiteFile[]> {
  const out: SiteFile[] = []
  for (const f of files) {
    if (f.name.startsWith('.')) {
      log(`skipping hidden file ${f.name}`)
      continue
    }
    try {
      const meta = await sharp(f.bytes).metadata()
      if (!meta.width || !meta.height) throw new Error('no dimensions')
      out.push(f)
    } catch {
      log(`skipping non-image ${f.name}`)
    }
  }
  return out
}
