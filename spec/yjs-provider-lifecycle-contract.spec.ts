import * as Y from 'yjs'
import { describe, expect, it, vi } from 'vitest'
import { Editable } from '../src/core.js'
import {
  activateBindingsAfterProviderSync,
  createProviderStatusSource,
  EditableYjsBinding,
  INITIAL_SYNC_ORIGIN,
  isInitialSyncOrigin
} from '../src/yjs/index.js'
import { simulateInsertText } from './helpers/yjs-sync-harness.js'

const defaultPolicy = {
  yEmptyHostFilled: 'copy-host-to-y' as const,
  hostEmptyYFilled: 'copy-y-to-host' as const,
  bothFilledDiffer: 'error' as const
}

describe('provider lifecycle contract', function () {
  afterEach(function () {
    document.querySelectorAll('[contenteditable]').forEach((node) => node.remove())
  })

  it('activateBindingsAfterProviderSync invokes activate exactly once across repeated synced', function () {
    const status = createProviderStatusSource({ status: 'synced' })
    const activate = vi.fn()
    activateBindingsAfterProviderSync({ providerStatus: status, activate })

    expect(activate).toHaveBeenCalledTimes(1)

    status.setStatus({ status: 'synced' })
    status.setStatus({ status: 'synced' })
    expect(activate).toHaveBeenCalledTimes(1)
  })

  it('unsubscribe prevents late activation after destroy', function () {
    const status = createProviderStatusSource({ status: 'connecting' })
    const activate = vi.fn()
    const unsubscribe = activateBindingsAfterProviderSync({ providerStatus: status, activate })

    unsubscribe()
    status.setStatus({ status: 'synced' })
    expect(activate).not.toHaveBeenCalled()
  })

  it('initial sync origin is not treated as binding undo origin', function () {
    expect(isInitialSyncOrigin(INITIAL_SYNC_ORIGIN)).toBe(true)
  })

  it('seeds Y.Text from host exactly once on activate (empty Y, filled host)', function () {
    const elem = document.createElement('div')
    elem.setAttribute('contenteditable', 'true')
    elem.textContent = 'seed-me'
    document.body.appendChild(elem)
    const editable = new Editable({ defaultBehavior: false })
    editable.add(elem)

    const doc = new Y.Doc()
    const yText = doc.getText('block')
    expect(yText.length).toBe(0)

    const binding = new EditableYjsBinding({
      editable,
      host: elem,
      yText,
      initialSync: defaultPolicy,
      deferInitialSync: true
    })

    binding.activate()
    expect(yText.toString()).toBe('seed-me')
    const lenAfterActivate = yText.length

    binding.activate()
    expect(yText.length).toBe(lenAfterActivate)

    binding.destroy()
    editable.unload()
    doc.destroy()
  })

  it('does not capture edits before activate (offline editing buffer stays local)', function () {
    const elem = document.createElement('div')
    elem.setAttribute('contenteditable', 'true')
    document.body.appendChild(elem)
    const editable = new Editable({ defaultBehavior: false })
    editable.add(elem)
    const doc = new Y.Doc()
    const yText = doc.getText('offline')

    const binding = new EditableYjsBinding({
      editable,
      host: elem,
      yText,
      initialSync: defaultPolicy,
      deferInitialSync: true
    })

    simulateInsertText(elem, editable, 'offline-only')
    expect(yText.toString()).toBe('')

    binding.destroy()
    expect(() => simulateInsertText(elem, editable, 'after-destroy')).not.toThrow()

    editable.unload()
    doc.destroy()
  })
})
