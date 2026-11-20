import { describe, expect, it } from 'vitest'
import {
  cleanLabel,
  collectHashes,
  createSkowtClient,
  extraLabel,
} from './skowt-client'

const h = (c: string) => c.repeat(32)

describe('labels', () => {
  it('cleans display names like fetch_characters.py', () => {
    expect(cleanLabel('Childe, Delusion (boss)')).toBe('Childe Delusion Boss')
    expect(cleanLabel('Itzpapa (skill)')).toBe('Itzpapa Skill')
  })

  it('derives extra labels and keeps them unique', () => {
    const used = new Set<string>()
    const asset = (name: string, role: string) => ({ id: name, name, role })
    expect(
      extraLabel(
        'Jean',
        asset('Jean · Outfit 1 3D model', 'model.outfit.sea'),
        used,
      ),
    ).toBe('Outfit 1')
    expect(
      extraLabel('Jean', asset('Jean · 3D model', 'model.outfit.wic'), used),
    ).toBe('Wic')
    expect(
      extraLabel(
        'Jean',
        asset('Jean · Wic 3D model', 'model.outfit.wic'),
        used,
      ),
    ).toBe('Wic Wic')
  })
})

describe('collectHashes', () => {
  it('splits main, extras and the default weapon', () => {
    const viewer = (model: string, anim: string) => ({
      model: { viewer: { format: 1, model, anim, props: 'not-a-hash' } },
    })
    const sets = collectHashes(
      'Citlali',
      [
        {
          id: '1',
          role: 'model',
          extension: 'glb',
          metadata: viewer(h('a'), h('b')),
        },
        {
          id: '2',
          role: 'model.outfit.xia',
          extension: 'glb',
          name: 'Citlali · Outfit 3D model',
          metadata: viewer(h('c'), h('b')),
        },
        { id: '3', role: 'icon.side', extension: 'png' },
      ],
      {
        defaultSetId: 's',
        weapons: [{ setId: 's', model: { viewer: h('f') } }],
      },
    )
    expect(sets).toEqual({
      main: [h('a'), h('b'), h('f')],
      extras: { Outfit: [h('c'), h('b')] },
      problems: [],
    })
  })
})

describe('createSkowtClient', () => {
  it('keeps cookies the API sets (signed links are bound to them)', async () => {
    const seen: (string | null)[] = []
    const fetchFn = (async (_url: string, init: RequestInit) => {
      seen.push(new Headers(init.headers).get('Cookie'))
      const res = new Response(
        JSON.stringify({ result: { data: { characters: [] } } }),
      )
      res.headers.append('Set-Cookie', 'skowt_visit=abc; Path=/; HttpOnly')
      return res
    }) as unknown as typeof fetch
    const client = createSkowtClient({
      fetch: fetchFn,
      cookie: 'session=s1',
      throttleMs: 0,
    })
    await client.characters()
    await client.characters()
    expect(seen).toEqual(['session=s1', 'session=s1; skowt_visit=abc'])
  })
})
