import * as Y from 'yjs'
import { Editable } from '../src/core.js'
import { getBlockOperationText } from '../src/operation-text-model.js'
import {
  classifyInitialSync,
  EditableYjsBinding,
  InitialSyncConflictError
} from '../src/yjs/index.js'

const defaultPolicy = {
  yEmptyHostFilled: 'copy-host-to-y' as const,
  hostEmptyYFilled: 'copy-y-to-host' as const,
  bothFilledDiffer: 'error' as const
}

describe('EditableYjsBinding', function () {
  let elem: HTMLElement
  let editable: Editable
  let doc: Y.Doc
  let yText: Y.Text

  beforeEach(function () {
    elem = document.createElement('div')
    document.body.appendChild(elem)
    editable = new Editable({ defaultBehavior: false })
    editable.add(elem)
    doc = new Y.Doc()
    yText = doc.getText('block')
  })

  afterEach(function () {
    editable.unload()
    elem.remove()
    doc.destroy()
  })

  it('classifies initial sync scenarios', function () {
    expect(classifyInitialSync('', '')).toBe('both-empty')
    expect(classifyInitialSync('hello', 'hello')).toBe('both-identical')
    expect(classifyInitialSync('hello', '')).toBe('y-empty-host-filled')
    expect(classifyInitialSync('', 'hello')).toBe('host-empty-y-filled')
    expect(classifyInitialSync('hello', 'world')).toBe('both-filled-differ')
  })

  it('copies host text to empty Y.Text', function () {
    elem.textContent = 'local'
    const binding = new EditableYjsBinding({
      editable,
      host: elem,
      yText,
      initialSync: defaultPolicy
    })
    expect(yText.toString()).toBe('local')
    binding.destroy()
    expect(binding.isDestroyed).toBe(true)
  })

  it('copies Y.Text to empty host', function () {
    yText.insert(0, 'remote')
    new EditableYjsBinding({
      editable,
      host: elem,
      yText,
      initialSync: defaultPolicy
    })
    expect(getBlockOperationText(elem)).toBe('remote')
  })

  it('leaves both-empty and both-identical unchanged', function () {
    const bindingEmpty = new EditableYjsBinding({
      editable,
      host: elem,
      yText,
      initialSync: defaultPolicy
    })
    expect(yText.toString()).toBe('')
    expect(getBlockOperationText(elem)).toBe('')
    bindingEmpty.destroy()

    yText.insert(0, 'same')
    elem.textContent = 'same'
    new EditableYjsBinding({
      editable,
      host: elem,
      yText,
      initialSync: defaultPolicy
    })
    expect(yText.toString()).toBe('same')
    expect(getBlockOperationText(elem)).toBe('same')
  })

  it('throws on conflict when policy is error', function () {
    elem.textContent = 'host'
    yText.insert(0, 'y')
    expect(() => {
      new EditableYjsBinding({
        editable,
        host: elem,
        yText,
        initialSync: defaultPolicy
      })
    }).toThrow(InitialSyncConflictError)
  })

  it('resolves conflicts with a mandatory resolver', function () {
    elem.textContent = 'host'
    yText.insert(0, 'y')
    new EditableYjsBinding({
      editable,
      host: elem,
      yText,
      initialSync: {
        ...defaultPolicy,
        bothFilledDiffer: {
          resolve: () => 'y'
        }
      }
    })
    expect(getBlockOperationText(elem)).toBe('y')
    expect(yText.toString()).toBe('y')
  })

  it('rejects unregistered hosts and invalid yText', function () {
    const orphan = document.createElement('div')
    document.body.appendChild(orphan)
    expect(() => {
      new EditableYjsBinding({
        editable,
        host: orphan,
        yText,
        initialSync: defaultPolicy
      })
    }).toThrow(/not registered/)
    orphan.remove()

    expect(() => {
      new EditableYjsBinding({
        editable,
        host: elem,
        yText: {} as Y.Text,
        initialSync: defaultPolicy
      })
    }).toThrow(/Y\.Text/)
  })

  it('is idempotent on destroy', function () {
    const binding = new EditableYjsBinding({
      editable,
      host: elem,
      yText,
      initialSync: defaultPolicy
    })
    binding.destroy()
    binding.destroy()
    expect(binding.isDestroyed).toBe(true)
  })
})
