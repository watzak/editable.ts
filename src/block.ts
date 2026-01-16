import config from './config.js'
import * as content from './content.js'

let nextBlockId = 1
const state: Record<string, any> = {}

export const next = getSibling('nextElementSibling')
export const previous = getSibling('previousElementSibling')

export function init (elem: HTMLElement, {normalize, plainText, shouldSpellcheck}: {normalize?: boolean, plainText?: boolean, shouldSpellcheck?: boolean} = {}) {
  setBlockId(elem)

  elem.setAttribute('contenteditable', 'true')
  elem.setAttribute('spellcheck', String(Boolean(shouldSpellcheck)))
  elem.setAttribute('data-plaintext', String(Boolean(plainText)))

  elem.classList.remove(config.editableDisabledClass)
  elem.classList.add(config.editableClass)

  if (normalize) content.tidyHtml(elem)
}


export function disable (elem: HTMLElement): void {
  elem.removeAttribute('contenteditable')
  elem.removeAttribute('spellcheck')
  elem.removeAttribute('data-plaintext')

  setState(elem, undefined)

  elem.classList.remove(config.editableClass)
  elem.classList.add(config.editableDisabledClass)
}

export function isPlainTextBlock (elem: HTMLElement): boolean {
  return elem.getAttribute('data-plaintext') === 'true'
}

export function setBlockId (elem: HTMLElement): void {
  if (!elem.hasAttribute('data-editable')) {
    elem.setAttribute('data-editable', `id-${nextBlockId}`)
    nextBlockId += 1
  }
}


export function getState (elem: HTMLElement): any {
  if (elem.hasAttribute('data-editable')) {
    const id = elem.getAttribute('data-editable')
    if (id) return state[id]
  }
}


export function setState (elem: HTMLElement, data: any): void {
  if (elem.hasAttribute('data-editable')) {
    const id = elem.getAttribute('data-editable')
    if (id) state[id] = data
  }
}


// Helpers
// -------

function getSibling (type: 'nextElementSibling' | 'previousElementSibling') {
  return function (element: HTMLElement): HTMLElement | null {
    const sibling = element[type] as HTMLElement | null
    return sibling && sibling.getAttribute('contenteditable')
      ? sibling
      : null
  }
}
