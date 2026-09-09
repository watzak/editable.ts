import * as Y from 'yjs'
import { createRange } from '../../src/util/dom.js'
import Cursor from '../../src/cursor.js'
import { getBlockOperationText } from '../../src/operation-text-model.js'
import { setSelectionFromSnapshot } from '../../src/operation-selection.js'
import type { Editable } from '../../src/core.js'
import type { InitialSyncPolicy } from '../../src/yjs/index.js'

export const defaultInitialSyncPolicy: InitialSyncPolicy = {
  yEmptyHostFilled: 'copy-host-to-y',
  hostEmptyYFilled: 'copy-y-to-host',
  bothFilledDiffer: 'error'
}

export function createCursorAtEnd(node: HTMLElement): Cursor {
  const range = createRange()
  range.selectNodeContents(node)
  range.collapse(false)
  const cursor = new Cursor(node, range)
  cursor.setVisibleSelection()
  return cursor
}

export function createSelection(node: HTMLElement, start: number, end: number): void {
  setSelectionFromSnapshot(node, {
    anchor: start,
    head: end,
    direction: start === end ? 'none' : 'forward'
  })
}

export function simulateInsertText(host: HTMLElement, editable: Editable, text: string): void {
  createCursorAtEnd(host)
  editable.dispatcher.selectionWatcher.syncSelection()

  host.dispatchEvent(
    new InputEvent('beforeinput', {
      inputType: 'insertText',
      data: text,
      bubbles: true,
      cancelable: true
    })
  )
  host.textContent = getBlockOperationText(host) + text
  host.dispatchEvent(
    new InputEvent('input', { inputType: 'insertText', data: text, bubbles: true })
  )
}

export function simulateReplaceSelection(
  host: HTMLElement,
  editable: Editable,
  start: number,
  end: number,
  text: string
): void {
  createSelection(host, start, end)
  editable.dispatcher.selectionWatcher.syncSelection()

  host.dispatchEvent(
    new InputEvent('beforeinput', {
      inputType: 'insertText',
      data: text,
      bubbles: true,
      cancelable: true
    })
  )
  const before = getBlockOperationText(host)
  host.textContent = before.slice(0, start) + text + before.slice(end)
  host.dispatchEvent(
    new InputEvent('input', { inputType: 'insertText', data: text, bubbles: true })
  )
}

export function simulateComposition(host: HTMLElement, editable: Editable, composed: string): void {
  createCursorAtEnd(host)
  editable.dispatcher.selectionWatcher.syncSelection()

  host.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
  host.textContent = composed
  host.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
}

export function syncDocToTarget(source: Y.Doc, target: Y.Doc): void {
  Y.applyUpdate(target, Y.encodeStateAsUpdate(source))
}

export function mergeDocs(a: Y.Doc, b: Y.Doc): void {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b))
}

export function createPlainHost(): HTMLElement {
  const host = document.createElement('div')
  host.setAttribute('contenteditable', 'true')
  document.body.appendChild(host)
  return host
}
