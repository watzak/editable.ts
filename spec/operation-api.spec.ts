import eventable from '../src/eventable.js'
import { OperationContext } from '../src/operation-context.js'
import { dispatchEditableOperations } from '../src/operation-pipeline.js'
import {
  OPERATION_LINE_BREAK,
  type EditableOperationBatch,
  type SerializableOperationBatch
} from '../src/operation-types.js'
import type { DispatcherEventMap } from '../src/event-types.js'
import type { Editable } from '../src/core.js'

function createNotifyHarness() {
  const bus = {} as {
    notify: import('../src/event-types.js').EventNotify<DispatcherEventMap, Editable>
    on: import('../src/event-types.js').EventOn<DispatcherEventMap, Editable, typeof bus>
  }
  eventable<typeof bus, Editable, DispatcherEventMap>(bus, {} as Editable)
  return bus
}

describe('Operation API', function () {
  describe('operation DTOs', function () {
    it('uses UTF-16 code unit indices for emoji offsets', function () {
      const batch: EditableOperationBatch = {
        source: 'api',
        operations: [{ type: 'insertText', index: 2, text: '😀' }]
      }
      expect(batch.operations[0]).toEqual({ type: 'insertText', index: 2, text: '😀' })
      expect('a😀b'.length).toBe(4)
    })

    it('represents line breaks as \\n instead of <br>', function () {
      expect(OPERATION_LINE_BREAK).toBe('\n')
      const batch: EditableOperationBatch = {
        source: 'keyboard',
        operations: [{ type: 'insertText', index: 4, text: `${OPERATION_LINE_BREAK}` }]
      }
      const op = batch.operations[0]
      expect(op?.type).toBe('insertText')
      if (op?.type === 'insertText') expect(op.text).toBe('\n')
    })

    it('serializes batches without origin metadata', function () {
      const batch: EditableOperationBatch = {
        source: 'paste',
        inputType: 'insertFromPaste',
        selectionBefore: { anchor: 0, head: 0, direction: 'none' },
        selectionAfter: { anchor: 5, head: 5, direction: 'none' },
        origin: { nativeEvent: new Event('input') },
        operations: [
          { type: 'replaceText', index: 0, length: 0, text: 'hello' },
          { type: 'setTextAttributes', index: 0, length: 5, attributes: { bold: true } }
        ]
      }

      const { origin: _origin, ...wireBatch } = batch
      const serialized: SerializableOperationBatch = wireBatch
      const roundTrip = JSON.parse(JSON.stringify(serialized)) as SerializableOperationBatch

      expect(roundTrip.source).toBe('paste')
      expect(roundTrip.operations).toHaveLength(2)
      expect(roundTrip).not.toHaveProperty('origin')
      expect(serialized).not.toHaveProperty('origin')
    })

    it('supports all four operation kinds with typed attributes', function () {
      const batch: EditableOperationBatch = {
        source: 'remote',
        operations: [
          { type: 'insertText', index: 0, text: 'a', attributes: { mark: 'x' } },
          { type: 'deleteText', index: 1, length: 1 },
          { type: 'replaceText', index: 2, length: 1, text: 'b', attributes: { mark: null } },
          {
            type: 'setTextAttributes',
            index: 0,
            length: 3,
            attributes: { italic: true, mark: null }
          }
        ]
      }
      expect(batch.operations.map((op) => op.type)).toEqual([
        'insertText',
        'deleteText',
        'replaceText',
        'setTextAttributes'
      ])
    })
  })

  describe('dispatchEditableOperations', function () {
    let host: HTMLElement

    beforeEach(function () {
      host = document.createElement('div')
      host.textContent = 'block'
      document.body.appendChild(host)
    })

    afterEach(function () {
      host.remove()
    })

    it('fires beforeOperation then operation with host passed separately', function () {
      const { notify, on } = createNotifyHarness()
      const order: string[] = []
      const batch: EditableOperationBatch = {
        source: 'beforeinput',
        inputType: 'insertText',
        operations: [{ type: 'insertText', index: 5, text: '!' }]
      }

      on('beforeOperation', (element, ctx) => {
        order.push('beforeOperation')
        expect(element).toBe(host)
        expect(ctx).toBeInstanceOf(OperationContext)
        expect(ctx.batch).toBe(batch)
      })
      on('operation', (element, emitted) => {
        order.push('operation')
        expect(element).toBe(host)
        expect(emitted).toBe(batch)
      })

      dispatchEditableOperations(notify, host, batch)
      expect(order).toEqual(['beforeOperation', 'operation'])
    })

    it('allows beforeOperation to cancel the batch', function () {
      const { notify, on } = createNotifyHarness()
      let operationCount = 0
      const batch: EditableOperationBatch = {
        source: 'keyboard',
        operations: [{ type: 'deleteText', index: 0, length: 1 }]
      }

      on('beforeOperation', (_element, ctx) => {
        ctx.cancel()
      })
      on('operation', () => {
        operationCount += 1
      })

      const context = dispatchEditableOperations(notify, host, batch)
      expect(context.cancelled).toBe(true)
      expect(operationCount).toBe(0)
    })

    it('skips operation when emitOperation is false', function () {
      const { notify, on } = createNotifyHarness()
      let operationCount = 0
      on('operation', () => {
        operationCount += 1
      })

      dispatchEditableOperations(
        notify,
        host,
        { source: 'api', operations: [{ type: 'insertText', index: 0, text: 'x' }] },
        { emitOperation: false }
      )
      expect(operationCount).toBe(0)
    })
  })
})
