/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('SSR-safe imports', function () {
  beforeEach(function () {
    vi.stubGlobal('window', undefined)
    vi.stubGlobal('document', undefined)
    vi.resetModules()
  })

  afterEach(function () {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('imports editable.ts core without throwing', async function () {
    const mod = await import('../src/core.js')
    expect(typeof mod.Editable).toBe('function')
  })

  it('imports editable.ts/features without throwing', async function () {
    const mod = await import('../src/features.js')
    expect(typeof mod.Editable).toBe('function')
  })

  it('throws when constructing without a browser window', async function () {
    const { Editable } = await import('../src/core.js')
    expect(() => new Editable()).toThrow(/requires a browser Window/)
  })
})
