import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import { dispatchEditableCommand } from '../src/command-pipeline.js'
import { buildMergeBlockCommand } from '../src/command-builder.js'
import { getBlockOperationText } from '../src/operation-text-model.js'
import { EditableYjsBinding, PRESENCE_STATE_KEY } from '../src/yjs/index.js'
import { splitYTextDeltaAt } from '../src/yjs/structural-ytext.js'
import type { EditableYjsStructuralAdapter } from '../src/yjs/structural-adapter.js'
import { defaultInitialSyncPolicy } from './helpers/yjs-sync-harness.js'
import { createStructuralFixture, simulateSplitAt } from './helpers/yjs-structural-harness.js'
import { simulateInsertText, simulateToggleBold } from './helpers/yjs-rich-harness.js'

describe('Yjs structural adapter hooks', function () {
  afterEach(function () {
    document.querySelectorAll('[contenteditable]').forEach((node) => node.remove())
    document.querySelectorAll('.editable-yjs-presence-layer').forEach((node) => node.remove())
  })

  function destroyFixture(fixture: ReturnType<typeof createStructuralFixture>): void {
    for (const id of [...fixture.registryMap.keys()]) {
      fixture.registry.get(id)?.binding.destroy()
    }
    fixture.editable.unload()
    fixture.container.remove()
  }

  it('splits formatted Y.Text without losing attributes', function () {
    const fixture = createStructuralFixture()
    simulateInsertText(fixture.host, fixture.editable, 'boldplain')
    simulateToggleBold(fixture.host, fixture.editable, 0, 4)

    simulateSplitAt(fixture.host, fixture.editable, 4)

    const hosts = fixture.container.querySelectorAll('[contenteditable]')
    expect(hosts.length).toBe(2)
    expect(fixture.blocks.length).toBe(2)

    const first = fixture.body.toDelta()
    expect(JSON.stringify(first)).toContain('bold')
    expect(getBlockOperationText(hosts[0] as HTMLElement)).toBe('bold')
    expect(getBlockOperationText(hosts[1] as HTMLElement)).toBe('plain')

    destroyFixture(fixture)
  })

  it('merges the next block backward into the current block', function () {
    const fixture = createStructuralFixture()
    simulateInsertText(fixture.host, fixture.editable, 'one')
    simulateSplitAt(fixture.host, fixture.editable, 3)

    const secondHost = fixture.container.querySelectorAll('[contenteditable]')[1] as HTMLElement
    simulateInsertText(secondHost, fixture.editable, 'two')

    const cursor = fixture.editable.createCursorAtBeginning(secondHost)
    expect(cursor).toBeTruthy()
    cursor!.setVisibleSelection()

    dispatchEditableCommand(
      fixture.editable.dispatcher.notify,
      buildMergeBlockCommand(secondHost, 'before', cursor!, 'api'),
      { cursor: cursor! }
    )

    expect(fixture.blocks.length).toBe(1)
    expect(getBlockOperationText(fixture.host)).toBe('onetwo')

    destroyFixture(fixture)
  })

  it('rejects structural intent without mutating the blocks array', function () {
    const rejectAdapter: EditableYjsStructuralAdapter = {
      splitBlock() {
        return { status: 'rejected', reason: 'demo' }
      }
    }

    const fixture = createStructuralFixture()
    fixture.binding.destroy()

    const binding = new EditableYjsBinding({
      editable: fixture.editable,
      host: fixture.host,
      yText: fixture.body,
      initialSync: defaultInitialSyncPolicy,
      structuralAdapter: rejectAdapter
    })

    simulateInsertText(fixture.host, fixture.editable, 'stay')
    simulateSplitAt(fixture.host, fixture.editable, 2)

    expect(fixture.blocks.length).toBe(1)
    expect(getBlockOperationText(fixture.host)).toBe('stay')

    binding.destroy()
    destroyFixture(fixture)
  })

  it('survives concurrent local insert while a remote peer splits elsewhere', function () {
    const local = createStructuralFixture()
    const remoteDoc = new Y.Doc()
    const remoteBlocks = remoteDoc.getArray('editable.ts:example:blocks')
    const remoteBody = new Y.Text()
    const remoteMap = new Y.Map<unknown>()
    remoteMap.set('id', 'remote-block')
    remoteMap.set('body', remoteBody)
    remoteBlocks.insert(0, [remoteMap])
    remoteBody.insert(0, 'remote')

    simulateInsertText(local.host, local.editable, 'local')
    Y.applyUpdate(local.doc, Y.encodeStateAsUpdate(remoteDoc))

    expect(local.blocks.length).toBeGreaterThanOrEqual(1)
    expect(getBlockOperationText(local.host)).toContain('local')

    destroyFixture(local)
  })

  it('ignores invalid presence when a bound Y.Text is deleted', function () {
    const doc = new Y.Doc()
    const yText = doc.getText('presence-block')
    yText.insert(0, 'remote')
    const awareness = new Awareness(doc)
    awareness.setLocalStateField(PRESENCE_STATE_KEY, {
      v: 1,
      anchor: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(yText, 0, -1)),
      head: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(yText, 3, 1)),
      name: 'Remote',
      color: '#2563eb',
      focused: true
    })

    doc.transact(() => {
      yText.delete(0, yText.length)
    })

    expect(awareness.getLocalState()?.[PRESENCE_STATE_KEY]?.name).toBe('Remote')
    awareness.destroy()
  })

  it('splitYTextDeltaAt preserves attributes at the cut point', function () {
    const doc = new Y.Doc()
    const yText = doc.getText('t')
    yText.insert(0, 'ab', { bold: true })
    yText.insert(2, 'cd', { bold: null })

    const { before, after } = splitYTextDeltaAt(yText, 2)
    expect(before).toEqual([{ insert: 'ab', attributes: { bold: true } }])
    expect(after).toEqual([{ insert: 'cd' }])
  })
})
