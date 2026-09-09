import * as Y from 'yjs'
import { vi } from 'vitest'
import { Awareness } from 'y-protocols/awareness'
import { Editable } from '../src/core.js'
import { getBlockOperationText } from '../src/operation-text-model.js'
import { setSelectionFromSnapshot } from '../src/operation-selection.js'
import { EditableYjsBinding, EditableYjsPresence, PRESENCE_STATE_KEY } from '../src/yjs/index.js'
import { createRichPeer, bindRichPeer, simulateInsertText } from './helpers/yjs-rich-harness.js'
import { defaultInitialSyncPolicy } from './helpers/yjs-sync-harness.js'
import { defaultPresenceRenderer } from '../src/yjs/presence-renderer.js'

describe('Yjs presence', function () {
  afterEach(function () {
    document.querySelectorAll('[contenteditable]').forEach((node) => node.remove())
    document.querySelectorAll('.editable-yjs-presence-layer').forEach((node) => node.remove())
  })

  function createBoundPeer(name: string, user: { name: string; color: string }) {
    const peer = createRichPeer(name)
    const doc = peer.doc
    const awareness = new Awareness(doc)
    const binding = bindRichPeer(peer)
    const presence = new EditableYjsPresence({
      editable: peer.editable,
      host: peer.host,
      yText: peer.yText,
      awareness,
      user,
      throttleMs: 0
    })
    return { ...peer, awareness, binding, presence }
  }

  it('never mutates host HTML or Y.Text when publishing awareness', function () {
    const a = createBoundPeer('shared', { name: 'A', color: '#ef4444' })
    simulateInsertText(a.host, a.editable, 'hello')
    const htmlBefore = a.host.innerHTML
    const yBefore = a.yText.toString()
    const deltaBefore = JSON.stringify(a.yText.toDelta())

    setSelectionFromSnapshot(a.host, { anchor: 0, head: 3, direction: 'forward' })
    a.editable.dispatcher.selectionWatcher.syncSelection()
    a.presence.refresh()

    expect(a.host.innerHTML).toBe(htmlBefore)
    expect(a.yText.toString()).toBe(yBefore)
    expect(JSON.stringify(a.yText.toDelta())).toBe(deltaBefore)

    const local = a.awareness.getLocalState()?.[PRESENCE_STATE_KEY]
    expect(local?.v).toBe(1)
    expect(local?.name).toBe('A')

    a.presence.destroy()
    a.binding.destroy()
    a.editable.unload()
  })

  it('renders remote presence for another client without content mutation', function () {
    const a = createBoundPeer('shared', { name: 'A', color: '#ef4444' })
    const b = createBoundPeer('shared', { name: 'B', color: '#3b82f6' })

    simulateInsertText(a.host, a.editable, 'synced text')
    Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc))

    setSelectionFromSnapshot(a.host, { anchor: 0, head: 6, direction: 'forward' })
    a.editable.dispatcher.selectionWatcher.syncSelection()
    a.presence.refresh()

    Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc))
    b.presence.refresh()

    const htmlBefore = b.host.innerHTML
    const yBefore = b.yText.toString()

    expect(b.host.querySelector('[data-editable]')).toBeNull()
    expect(document.querySelector('.editable-yjs-presence-layer')).not.toBeNull()
    expect(getBlockOperationText(b.host)).toBe(yBefore)
    expect(b.host.innerHTML).toBe(htmlBefore)

    a.presence.destroy()
    b.presence.destroy()
    a.binding.destroy()
    b.binding.destroy()
    a.editable.unload()
    b.editable.unload()
  })

  it('ignores invalid awareness payloads', function () {
    const a = createBoundPeer('shared', { name: 'A', color: '#000' })
    const b = createBoundPeer('shared', { name: 'B', color: '#000' })

    simulateInsertText(a.host, a.editable, 'text')
    Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc))

    b.awareness.setLocalStateField(PRESENCE_STATE_KEY, {
      v: 1,
      anchor: 'not-a-position',
      head: null,
      name: '<script>',
      color: 'expression(alert(1))',
      focused: true
    })

    expect(() => b.presence.refresh()).not.toThrow()
    expect(getBlockOperationText(b.host)).toBe('text')
    expect(b.yText.toString()).toBe('text')

    a.presence.destroy()
    b.presence.destroy()
    a.binding.destroy()
    b.binding.destroy()
    a.editable.unload()
    b.editable.unload()
  })

  it('clears local presence on blur when hideOnBlur is true', function () {
    const peer = createRichPeer('shared')
    const awareness = new Awareness(peer.doc)
    const binding = new EditableYjsBinding({
      editable: peer.editable,
      host: peer.host,
      yText: peer.yText,
      initialSync: defaultInitialSyncPolicy
    })
    const presence = new EditableYjsPresence({
      editable: peer.editable,
      host: peer.host,
      yText: peer.yText,
      awareness,
      user: { name: 'A', color: '#000' },
      hideOnBlur: true,
      throttleMs: 0
    })

    peer.host.focus()
    setSelectionFromSnapshot(peer.host, { anchor: 0, head: 0, direction: 'none' })
    presence.refresh()
    expect(awareness.getLocalState()?.[PRESENCE_STATE_KEY]?.focused).toBe(true)

    peer.host.blur()
    expect(awareness.getLocalState()?.[PRESENCE_STATE_KEY]?.focused).toBe(false)

    presence.destroy()
    binding.destroy()
    peer.editable.unload()
  })

  it('supports multiple remote users on one host', function () {
    const peer = createBoundPeer('shared', { name: 'Local', color: '#111111' })
    simulateInsertText(peer.host, peer.editable, 'abc')

    let renderedCount = 0
    peer.presence.destroy()
    const presence = new EditableYjsPresence({
      editable: peer.editable,
      host: peer.host,
      yText: peer.yText,
      awareness: peer.awareness,
      user: { name: 'Local', color: '#111111' },
      throttleMs: 0,
      renderer: {
        render(ctx) {
          renderedCount = ctx.presences.length
          defaultPresenceRenderer(ctx)
        }
      }
    })

    const yText = peer.yText
    const payload = (start: number, end: number, name: string, color: string) => ({
      [PRESENCE_STATE_KEY]: {
        v: 1,
        anchor: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(yText, start, -1)),
        head: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(yText, end, 1)),
        name,
        color,
        focused: true
      }
    })

    const states = new Map<number, Record<string, unknown>>([
      [peer.awareness.clientID, peer.awareness.getLocalState() ?? {}],
      [101, payload(0, 1, 'B', '#0000ff')],
      [102, payload(2, 3, 'C', '#00ff00')]
    ])

    vi.spyOn(peer.awareness, 'getStates').mockReturnValue(states)
    presence.refresh()
    expect(renderedCount).toBe(2)

    presence.destroy()
    peer.binding.destroy()
    peer.editable.unload()
  })

  it('never serializes presence into Y.Doc updates', function () {
    const peer = createBoundPeer('shared', { name: 'A', color: '#ef4444' })
    simulateInsertText(peer.host, peer.editable, 'rich')
    const docStateBefore = Y.encodeStateAsUpdate(peer.doc)
    const deltaBefore = JSON.stringify(peer.yText.toDelta())

    setSelectionFromSnapshot(peer.host, { anchor: 0, head: 4, direction: 'forward' })
    peer.presence.refresh()

    peer.awareness.setLocalStateField(PRESENCE_STATE_KEY, {
      v: 1,
      anchor: 'invalid',
      head: null,
      name: '<script>alert(1)</script>',
      color: 'url(javascript:alert(1))',
      focused: true
    })
    peer.presence.refresh()

    expect(Y.encodeStateAsUpdate(peer.doc)).toEqual(docStateBefore)
    expect(JSON.stringify(peer.yText.toDelta())).toBe(deltaBefore)
    expect(peer.yText.toString()).toBe('rich')

    peer.presence.destroy()
    peer.binding.destroy()
    peer.editable.unload()
  })

  it('renders inside an iframe without mutating host content', function () {
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    const frameDoc = iframe.contentDocument!
    frameDoc.open()
    frameDoc.write('<!doctype html><html><body></body></html>')
    frameDoc.close()

    const host = frameDoc.createElement('div')
    host.setAttribute('contenteditable', 'true')
    frameDoc.body.appendChild(host)

    const editable = new Editable({ window: iframe.contentWindow! })
    editable.add(host)

    const doc = new Y.Doc()
    const yText = doc.getText('iframe')
    const awareness = new Awareness(doc)
    const binding = new EditableYjsBinding({
      editable,
      host,
      yText,
      initialSync: defaultInitialSyncPolicy
    })

    simulateInsertText(host, editable, 'iframe text')

    const presence = new EditableYjsPresence({
      editable,
      host,
      yText,
      awareness,
      user: { name: 'Frame', color: '#22c55e' },
      throttleMs: 0
    })

    setSelectionFromSnapshot(host, { anchor: 0, head: 4, direction: 'forward' })
    presence.refresh()

    expect(frameDoc.querySelector('.editable-yjs-presence-layer')).not.toBeNull()
    expect(host.querySelector('[data-editable]')).toBeNull()
    expect(getBlockOperationText(host)).toBe('iframe text')

    presence.destroy()
    binding.destroy()
    editable.unload()
    iframe.remove()
  })

  it('re-renders overlay on scroll without changing Y.Text', function () {
    const peer = createBoundPeer('shared', { name: 'A', color: '#000' })
    simulateInsertText(peer.host, peer.editable, 'scroll me')
    const yBefore = peer.yText.toString()

    let renderCalls = 0
    peer.presence.destroy()
    const presence = new EditableYjsPresence({
      editable: peer.editable,
      host: peer.host,
      yText: peer.yText,
      awareness: peer.awareness,
      user: { name: 'A', color: '#000' },
      throttleMs: 0,
      renderer: {
        render(ctx) {
          renderCalls += 1
          defaultPresenceRenderer(ctx)
        }
      }
    })

    const yText = peer.yText
    const remoteState = {
      [PRESENCE_STATE_KEY]: {
        v: 1,
        anchor: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(yText, 0, -1)),
        head: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(yText, 3, 1)),
        name: 'Remote',
        color: '#2563eb',
        focused: true
      }
    }
    vi.spyOn(peer.awareness, 'getStates').mockReturnValue(
      new Map<number, Record<string, unknown>>([
        [999, remoteState],
        [peer.awareness.clientID, {}]
      ])
    )

    presence.refresh()
    const callsAfterRefresh = renderCalls
    window.dispatchEvent(new Event('scroll'))
    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        expect(renderCalls).toBeGreaterThan(callsAfterRefresh)
        expect(peer.yText.toString()).toBe(yBefore)
        presence.destroy()
        peer.binding.destroy()
        peer.editable.unload()
        resolve()
      })
    })
  })

  it('cleans up overlay and listeners on destroy', function () {
    const peer = createBoundPeer('shared', { name: 'A', color: '#000' })
    simulateInsertText(peer.host, peer.editable, 'x')
    setSelectionFromSnapshot(peer.host, { anchor: 1, head: 1, direction: 'none' })
    peer.presence.refresh()

    expect(document.querySelector('.editable-yjs-presence-layer')).not.toBeNull()
    peer.presence.destroy()
    expect(document.querySelector('.editable-yjs-presence-layer')).toBeNull()
    expect(peer.awareness.getLocalState()?.[PRESENCE_STATE_KEY]).toBeNull()

    peer.binding.destroy()
    peer.editable.unload()
  })
})
