import type { SelectionChangeDocument } from './dom-compat.js'

export interface WindowFeatures {
  contenteditable: boolean
  selectionchange: boolean
  contenteditableSpanBug: boolean
}

const featuresByWindow = new WeakMap<Window, WindowFeatures>()

function hasNativeSelectionchangeSupport(document: Document): boolean {
  const doc = document as SelectionChangeDocument
  const osc = doc.onselectionchange
  if (osc !== undefined) {
    try {
      doc.onselectionchange = null
      return doc.onselectionchange === null
    } catch {
      // ignore
    } finally {
      doc.onselectionchange = osc
    }
  }
  return false
}

function detectWindowFeatures(win: Window): WindowFeatures {
  const doc = win.document
  const contenteditable =
    typeof doc.documentElement !== 'undefined' &&
    typeof doc.documentElement.contentEditable !== 'undefined'

  const userAgent = win.navigator?.userAgent ?? ''
  const isBlink = /(apple)?webkit\/537\.36/i.test(userAgent)
  const isWebkit = /(apple)?webkit/i.test(userAgent)
  const webKit = !isBlink && isWebkit

  return {
    contenteditable,
    selectionchange: hasNativeSelectionchangeSupport(doc),
    contenteditableSpanBug: !!webKit
  }
}

export function getWindowFeatures(win: Window): WindowFeatures {
  let features = featuresByWindow.get(win)
  if (!features) {
    features = detectWindowFeatures(win)
    featuresByWindow.set(win, features)
  }
  return features
}
