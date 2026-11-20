import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { SourceEntityError } from '../source'
import { createAmberSource } from './amber-source'

const FIX = join(import.meta.dirname, '../../../test/fixtures/amber')
const BASE = 'https://gi.yatta.moe/api/v2'

// biome-ignore lint/suspicious/noExplicitAny: tests hand-edit fixture JSON
function fixture(name: string): any {
  return JSON.parse(readFileSync(join(FIX, `${name}.json`), 'utf8'))
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status })

/** Serves fixtures by URL: {lang}/{avatar|weapon|material}[/{id}]. Missing -> 404. */
function fakeFetch(overrides: Record<string, () => Response> = {}) {
  const calls: string[] = []
  const fn = vi.fn(async (input: string | URL) => {
    const url = String(input)
    calls.push(url)
    if (overrides[url]) return overrides[url]()
    const [lang, kind, id] = url.slice(`${BASE}/`.length).split('/')
    const name = id ? `${kind}-${id}-${lang}` : `${kind}-list-${lang}`
    try {
      return json(fixture(name))
    } catch {
      return json({ code: 404, data: 'Data Not Found!' }, 404)
    }
  })
  return { fn: fn as unknown as typeof fetch, calls, mock: fn }
}

afterEach(() => vi.useRealTimers())

describe('getCharacter', () => {
  test('maps Nahida', async () => {
    const src = createAmberSource({ fetch: fakeFetch().fn })
    const c = await src.getCharacter('10000073')
    expect(c.id).toBe('10000073')
    expect(c.element).toBe('dendro')
    expect(c.weaponType).toBe('catalyst')
    expect(c.rarity).toBe(5)
    expect(c.birthday).toEqual([10, 27])
    expect(c.releaseAt).toEqual(new Date(1667253600 * 1000))
    expect(c.i18n.en?.name).toBe('Nahida')
    expect(c.i18n.ru).toBeDefined()
    expect(c.i18n['zh-CN']).toBeUndefined()
    expect(c.i18n.en?.title).toBe('Physic of Purity')
    expect(c.i18n.en?.details.talents.length).toBeGreaterThan(0)
    const urls = c.media.map((m) => m.url)
    expect(urls.some((u) => u.endsWith('UI_AvatarIcon_Nahida.png'))).toBe(true)
    expect(urls.some((u) => u.endsWith('UI_Gacha_AvatarImg_Nahida.png'))).toBe(
      true,
    )
    expect(c.media.map((m) => m.kind)).toEqual(['icon', 'gacha_splash'])
  })

  test('traveler keeps composite id; zero birthday -> null', async () => {
    const src = createAmberSource({ fetch: fakeFetch().fn })
    const c = await src.getCharacter('10000005-pyro')
    expect(c.id).toBe('10000005-pyro')
    expect(c.element).toBe('pyro')
    expect(c.birthday).toBeNull()
  })

  test('unknown element rejects with SourceEntityError', async () => {
    const bad = fixture('avatar-10000073-en')
    bad.data.element = 'Void'
    const f = fakeFetch({
      [`${BASE}/en/avatar/10000073`]: () => json(bad),
    })
    const src = createAmberSource({ fetch: f.fn })
    await expect(src.getCharacter('10000073')).rejects.toBeInstanceOf(
      SourceEntityError,
    )
  })

  test('missing en rejects with SourceEntityError', async () => {
    const f = fakeFetch({
      [`${BASE}/en/avatar/10000073`]: () => json({ code: 404 }, 404),
    })
    const src = createAmberSource({ fetch: f.fn })
    await expect(src.getCharacter('10000073')).rejects.toBeInstanceOf(
      SourceEntityError,
    )
  })

  test('rarity 105 maps to 5', async () => {
    const bad = fixture('avatar-10000073-en')
    bad.data.rank = 105
    const f = fakeFetch({ [`${BASE}/en/avatar/10000073`]: () => json(bad) })
    const c = await createAmberSource({ fetch: f.fn }).getCharacter('10000073')
    expect(c.rarity).toBe(5)
  })
})

describe('getWeapon', () => {
  test('maps Mistsplitter', async () => {
    const src = createAmberSource({ fetch: fakeFetch().fn })
    const w = await src.getWeapon('11509')
    expect(w.weaponType).toBe('sword')
    expect(w.rarity).toBe(5)
    expect(w.i18n.en?.name).toBe('Mistsplitter Reforged')
    expect(w.i18n.en?.details.affix).toBeTruthy()
    expect(w.media.map((m) => m.kind)).toEqual(['icon', 'gacha_icon'])
    expect(w.media[0]?.url).toBe(
      'https://gi.yatta.moe/assets/UI/UI_EquipIcon_Sword_Narukami.png',
    )
    expect(
      w.media[1]?.url.endsWith('UI_Gacha_EquipIcon_Sword_Narukami.png'),
    ).toBe(true)
  })
})

describe('lists', () => {
  test('listCharacters includes traveler; listHash tracks any locale', async () => {
    const a = await createAmberSource({
      fetch: fakeFetch().fn,
    }).listCharacters()
    expect(a.map((e) => e.id)).toContain('10000005-pyro')

    const ru = fixture('avatar-list-ru')
    ru.data.items['10000073'].name = 'Changed'
    const f = fakeFetch({ [`${BASE}/ru/avatar`]: () => json(ru) })
    const b = await createAmberSource({ fetch: f.fn }).listCharacters()
    const pick = (l: typeof a, id: string) =>
      l.find((e) => e.id === id)?.listHash
    expect(pick(b, '10000073')).not.toBe(pick(a, '10000073'))
    expect(pick(b, '10000006')).toBe(pick(a, '10000006'))
  })

  test('listWeapons', async () => {
    const l = await createAmberSource({ fetch: fakeFetch().fn }).listWeapons()
    expect(l.map((e) => e.id)).toContain('11509')
  })

  test('listMaterials', async () => {
    const l = await createAmberSource({ fetch: fakeFetch().fn }).listMaterials()
    expect(l).toHaveLength(5)
    const m = l[0]
    expect(m?.id).toBe('102')
    expect(m?.category).toBe('systemAccess')
    expect(m?.i18n.en).toEqual({ name: 'Adventure EXP', description: null })
    expect(m?.i18n.ru).toBeDefined()
    expect(m?.media).toEqual([
      {
        kind: 'icon',
        url: 'https://gi.yatta.moe/assets/UI/UI_ItemIcon_102.png',
      },
    ])
  })
})

describe('http behaviour', () => {
  const url = `${BASE}/en/avatar/10000073`

  test('retries 5xx then succeeds', async () => {
    let n = 0
    const f = fakeFetch({
      [url]: () =>
        ++n <= 2 ? json({}, 503) : json(fixture('avatar-10000073-en')),
    })
    const src = createAmberSource({ fetch: f.fn, retries: 2, retryDelayMs: 1 })
    await src.getCharacter('10000073')
    expect(f.calls.filter((u) => u === url)).toHaveLength(3)
  })

  test('does not retry 4xx', async () => {
    const f = fakeFetch()
    await createAmberSource({ fetch: f.fn }).getCharacter('10000005-pyro')
    // ru/chs/cht... 404s were hit once each
    expect(
      f.calls.filter((u) => u === `${BASE}/chs/avatar/10000005-pyro`),
    ).toHaveLength(1)
  })

  test('hanging request rejects after timeoutMs', async () => {
    const hang = vi.fn(
      (_u: string | URL, init?: RequestInit) =>
        new Promise<Response>((_res, rej) => {
          init?.signal?.addEventListener('abort', () =>
            rej(init.signal?.reason),
          )
        }),
    ) as unknown as typeof fetch
    const src = createAmberSource({
      fetch: hang,
      timeoutMs: 20,
      retries: 0,
    })
    await expect(src.listWeapons()).rejects.toBeDefined()
  })

  test('limits concurrency', async () => {
    let active = 0
    let max = 0
    const f = vi.fn(async (input: string | URL) => {
      active++
      max = Math.max(max, active)
      await new Promise((r) => setTimeout(r, 5))
      active--
      const [lang, kind] = String(input).slice(`${BASE}/`.length).split('/')
      return json(fixture(`${kind}-list-${lang}`))
    }) as unknown as typeof fetch
    await createAmberSource({ fetch: f, concurrency: 2 }).listCharacters()
    expect(max).toBe(2)
  })
})
