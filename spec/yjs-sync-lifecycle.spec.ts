import * as Y from 'yjs'
import { Editable } from '../src/core.js'
import {
  activateBindingsAfterProviderSync,
  createProviderStatusSource,
  EditableYjsBinding,
  isProviderReadyForInitialSync
} from '../src/yjs/index.js'
import { simulateInsertText } from './helpers/yjs-sync-harness.js'

const defaultPolicy = {
  yEmptyHostFilled: 'copy-host-to-y' as const,
  hostEmptyYFilled: 'copy-y-to-host' as const,
  bothFilledDiffer: 'error' as const
}

describe('Yjs sync lifecycle', function () {
  afterEach(function () {
    document.querySelectorAll('[contenteditable]').forEach((node) => node.remove())
  })

  it('defers initial sync until activate()', function () {
    const elem = document.createElement('div')
    elem.setAttribute('contenteditable', 'true')
    document.body.appendChild(elem)
    const editable = new Editable({ defaultBehavior: false })
    editable.add(elem)
    const doc = new Y.Doc()
    const yText = doc.getText('block')
    yText.insert(0, 'remote')

    const diagnostics: string[] = []
    const binding = new EditableYjsBinding({
      editable,
      host: elem,
      yText,
      initialSync: defaultPolicy,
      deferInitialSync: true,
      onSyncDiagnostic: (d) => diagnostics.push(d.kind)
    })

    expect(binding.isActivated).toBe(false)
    expect(elem.textContent).toBe('')

    binding.activate()
    expect(binding.isActivated).toBe(true)
    expect(elem.textContent).toBe('remote')
    expect(diagnostics).toContain('binding-deferred')
    expect(diagnostics).toContain('binding-activated')

    binding.destroy()
    editable.unload()
    doc.destroy()
  })

  it('activateBindingsAfterProviderSync waits for synced status', function () {
    const status = createProviderStatusSource({ status: 'connecting' })
    let activated = false

    const unsubscribe = activateBindingsAfterProviderSync({
      providerStatus: status,
      activate: () => {
        activated = true
      }
    })

    expect(activated).toBe(false)
    expect(isProviderReadyForInitialSync(status.getStatus())).toBe(false)

    status.setStatus({ status: 'connected' })
    expect(activated).toBe(false)

    status.setStatus({ status: 'synced' })
    expect(activated).toBe(true)

    unsubscribe()
  })

  it('does not capture local edits before activate', function () {
    const elem = document.createElement('div')
    elem.setAttribute('contenteditable', 'true')
    document.body.appendChild(elem)
    const editable = new Editable({ defaultBehavior: false })
    editable.add(elem)

    const doc = new Y.Doc()
    const yText = doc.getText('block')
    const binding = new EditableYjsBinding({
      editable,
      host: elem,
      yText,
      initialSync: defaultPolicy,
      deferInitialSync: true
    })

    simulateInsertText(elem, editable, 'early')
    expect(yText.toString()).toBe('')

    binding.activate()
    simulateInsertText(elem, editable, 'late')
    expect(yText.toString()).toContain('late')

    binding.destroy()
    editable.unload()
    doc.destroy()
  })
})
