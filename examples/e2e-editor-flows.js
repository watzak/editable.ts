import { Editable } from '../src/features.ts'
import { getSelectionCoordinates } from '../src/util/dom.ts'
import * as clipboard from '../src/clipboard.ts'
import createDefaultBehavior from '../src/create-default-behavior.ts'

const editable = new Editable({ browserSpellcheck: false })

const eventNames = []
const eventLog = document.querySelector('[data-testid="event-log"]')

function logEvent(name) {
  eventNames.unshift(name)
  if (eventNames.length > 12) eventNames.pop()
  const value = eventNames.join(',')
  eventLog.textContent = value
  eventLog.setAttribute('data-events', value)
}

function createScopedLogger(testId) {
  const names = []
  const logEl = document.querySelector(`[data-testid="${testId}"]`)

  return function scopedLog(name) {
    names.unshift(name)
    if (names.length > 12) names.pop()
    const value = names.join(',')
    logEl.textContent = value
    logEl.setAttribute('data-events', value)
  }
}

function isParagraphExample(elem) {
  return elem.closest('.e2e-paragraph-example, .e2e-merge-example') != null
}

function isPasteExample(elem) {
  return elem.closest('.e2e-pasting-example') != null
}

function isMultiblockPasteExample(elem) {
  return elem.closest('.e2e-multiblock-paste') != null
}

function isPasteSecurityExample(elem) {
  return elem.closest('.e2e-paste-security') != null
}

function isCompositionExample(elem) {
  return elem.closest('.e2e-composition-example') != null
}

// Paragraph example — keyboard flows
editable.enable('.e2e-paragraph-example p, .e2e-merge-example p', { normalize: true })

editable
  .on('focus', (elem) => {
    if (!isParagraphExample(elem)) return
    logEvent('focus')
  })
  .on('blur', (elem) => {
    if (!isParagraphExample(elem)) return
    logEvent('blur')
  })
  .on('change', (elem) => {
    if (!isParagraphExample(elem)) return
    logEvent('change')
  })
  .on('insert', (elem) => {
    if (!isParagraphExample(elem)) return
    logEvent('insert')
  })
  .on('split', (elem) => {
    if (!isParagraphExample(elem)) return
    logEvent('split')
  })
  .on('merge', (elem) => {
    if (!isParagraphExample(elem)) return
    logEvent('merge')
  })
  .on('paste', (elem) => {
    if (!isParagraphExample(elem)) return
    logEvent('paste')
  })

// Formatting + toolbar
const formattingBlock = document.querySelector('[data-testid="formatting-block"]')
const formattingHtml = document.querySelector('[data-testid="formatting-html"]')

editable.enable('.e2e-formatting-example p', { normalize: true })

function updateFormattingHtml(elem) {
  formattingHtml.textContent = editable.getContent(elem).trim()
}

updateFormattingHtml(formattingBlock)

editable.on('change', (elem) => {
  if (elem === formattingBlock) updateFormattingHtml(elem)
})

// Nested markup formatting
const nestedFormattingBlock = document.querySelector('[data-testid="nested-formatting-block"]')
const nestedFormattingHtml = document.querySelector('[data-testid="nested-formatting-html"]')

editable.enable('.e2e-nested-formatting p', { normalize: true })

function updateNestedFormattingHtml(elem) {
  nestedFormattingHtml.textContent = editable.getContent(elem).trim()
}

updateNestedFormattingHtml(nestedFormattingBlock)

editable.on('change', (elem) => {
  if (elem === nestedFormattingBlock) updateNestedFormattingHtml(elem)
})

setupTooltip()
setupNestedTooltip()

function setupTooltip() {
  const tooltipWrapper = document.createElement('div')
  tooltipWrapper.innerHTML =
    '<div class="e2e-selection-tip" data-testid="selection-tip" style="display:none;">' +
    '<button type="button" class="js-format js-format-bold" data-testid="format-bold">Bold</button>' +
    '</div>'

  const tooltip = tooltipWrapper.firstElementChild
  document.body.appendChild(tooltip)

  let currentSelection

  editable
    .selection((el, selection) => {
      if (!el.closest('.e2e-formatting-example')) return

      currentSelection = selection
      if (!selection) {
        tooltip.style.display = 'none'
        return
      }

      const coords = getSelectionCoordinates(window.getSelection())?.[0]
      if (!coords) return

      tooltip.style.display = 'block'
      tooltip.style.position = 'fixed'
      tooltip.style.zIndex = '9999'
      tooltip.style.top = `${coords.top - tooltip.offsetHeight - 15}px`
      tooltip.style.left = `${coords.left + coords.width / 2 - tooltip.offsetWidth / 2}px`
    })
    .blur(() => {
      tooltip.style.display = 'none'
    })

  tooltip.querySelector('.js-format-bold').addEventListener('mousedown', (event) => {
    event.preventDefault()
  })

  tooltip.querySelector('.js-format-bold').addEventListener('click', () => {
    if (!currentSelection?.isSelection) return
    currentSelection.toggleBold()
    currentSelection.triggerChange()
  })
}

function setupNestedTooltip() {
  const tooltipWrapper = document.createElement('div')
  tooltipWrapper.innerHTML =
    '<div class="e2e-nested-selection-tip" data-testid="nested-selection-tip" style="display:none;">' +
    '<button type="button" class="js-format js-format-italic" data-testid="format-italic">Italic</button>' +
    '<button type="button" class="js-format js-format-bold-nested" data-testid="format-bold-nested">Bold</button>' +
    '</div>'

  const tooltip = tooltipWrapper.firstElementChild
  document.body.appendChild(tooltip)

  let currentSelection

  editable
    .selection((el, selection) => {
      if (!el.closest('.e2e-nested-formatting')) return

      currentSelection = selection
      if (!selection) {
        tooltip.style.display = 'none'
        return
      }

      const coords = getSelectionCoordinates(window.getSelection())?.[0]
      if (!coords) return

      tooltip.style.display = 'block'
      tooltip.style.position = 'fixed'
      tooltip.style.zIndex = '9999'
      tooltip.style.top = `${coords.top - tooltip.offsetHeight - 15}px`
      tooltip.style.left = `${coords.left + coords.width / 2 - tooltip.offsetWidth / 2}px`
    })
    .blur(() => {
      tooltip.style.display = 'none'
    })

  for (const selector of ['.js-format-italic', '.js-format-bold-nested']) {
    tooltip.querySelector(selector).addEventListener('mousedown', (event) => {
      event.preventDefault()
    })
  }

  tooltip.querySelector('.js-format-italic').addEventListener('click', () => {
    if (!currentSelection?.isSelection) return
    currentSelection.toggleEmphasis()
    currentSelection.triggerChange()
  })

  tooltip.querySelector('.js-format-bold-nested').addEventListener('click', () => {
    if (!currentSelection?.isSelection) return
    currentSelection.toggleBold()
    currentSelection.triggerChange()
  })
}

// Paste example
editable.enable('.e2e-pasting-example p', { normalize: true })

editable.on('paste', (elem) => {
  if (!isPasteExample(elem)) return
  logEvent('paste')
})

// Multi-block paste
editable.enable('.e2e-multiblock-paste p', { normalize: true })

editable.on('paste', (elem) => {
  if (!isMultiblockPasteExample(elem)) return
  logEvent('multiblock-paste')
})

// Paste security
const pasteSecurityHtml = document.querySelector('[data-testid="paste-security-html"]')

editable.enable('.e2e-paste-security p', { normalize: true })

function updatePasteSecurityHtml(elem) {
  pasteSecurityHtml.textContent = editable.getContent(elem).trim()
}

editable.on('paste', (elem) => {
  if (!isPasteSecurityExample(elem)) return
  logEvent('paste-security')
  updatePasteSecurityHtml(elem)
})

// Two Editable instances in one document
const editableA = new Editable({ browserSpellcheck: false })
const editableB = new Editable({ browserSpellcheck: false })
const logInstanceA = createScopedLogger('instance-a-log')
const logInstanceB = createScopedLogger('instance-b-log')

editableA.enable('.e2e-instance-a p', { normalize: true })
editableB.enable('.e2e-instance-b p', { normalize: true })

editableA.on('change', (elem) => {
  if (elem.closest('.e2e-instance-a')) logInstanceA('change-a')
})
editableB.on('change', (elem) => {
  if (elem.closest('.e2e-instance-b')) logInstanceB('change-b')
})

// Composition / IME guard
const logComposition = createScopedLogger('composition-log')

editable.enable('.e2e-composition-example p', { normalize: true })

editable.on('split', (elem) => {
  if (!isCompositionExample(elem)) return
  logComposition('split')
})

editable.on('insert', (elem) => {
  if (!isCompositionExample(elem)) return
  logComposition('insert')
})

// Unicode
editable.enable('.e2e-unicode-example p', { normalize: true })

// Undo / structural
editable.enable('.e2e-undo-example p', { normalize: true })

// Lifecycle (mount / unmount)
const lifecycleBlock = document.querySelector('[data-testid="lifecycle-block"]')
const lifecycleStatus = document.querySelector('[data-testid="lifecycle-status"]')

editable.enable(lifecycleBlock, { normalize: true })

function setLifecycleStatus(status) {
  lifecycleStatus.textContent = status
  lifecycleStatus.setAttribute('data-status', status)
}

document.querySelector('[data-testid="btn-disable"]').addEventListener('click', () => {
  editable.disable(lifecycleBlock)
  setLifecycleStatus('disabled')
})

document.querySelector('[data-testid="btn-enable"]').addEventListener('click', () => {
  editable.enable(lifecycleBlock, { normalize: true })
  setLifecycleStatus('enabled')
})

document.querySelector('[data-testid="btn-suspend"]').addEventListener('click', () => {
  editable.suspend(lifecycleBlock)
  setLifecycleStatus('suspended')
})

document.querySelector('[data-testid="btn-continue"]').addEventListener('click', () => {
  editable.continue(lifecycleBlock)
  setLifecycleStatus('continued')
})

document.querySelector('[data-testid="btn-remove"]').addEventListener('click', () => {
  editable.remove(lifecycleBlock)
  setLifecycleStatus('removed')
})

document.querySelector('[data-testid="btn-readd"]').addEventListener('click', () => {
  editable.add(lifecycleBlock, { normalize: true })
  setLifecycleStatus('readded')
})

document.querySelector('[data-testid="btn-unload"]').addEventListener('click', () => {
  editable.unload()
  setLifecycleStatus('unloaded')
})

function simulatePaste(testId, clipboardContent) {
  const block = document.querySelector(`[data-testid="${testId}"]`)
  if (!block) return false

  let cursor = editable.getSelection(block) ?? editable.createCursorAtEnd(block)
  if (!cursor) return false

  const { blocks, cursor: updatedCursor } = clipboard.paste(
    block,
    cursor,
    clipboardContent,
    editable.pasteRules
  )

  if (!blocks.length) return false

  const behavior = createDefaultBehavior(editable)
  behavior.paste(block, blocks, updatedCursor)
  editable.dispatcher.notify('paste', block, blocks, updatedCursor)
  editable.dispatcher.notify('change', block, { source: 'paste' })
  return true
}

const logRemoteApply = createScopedLogger('remote-apply-log')
editable.enable('.e2e-remote-apply p', { normalize: true })
editable
  .on('change', (elem) => {
    if (!elem.closest('.e2e-remote-apply')) return
    logRemoteApply('change')
  })
  .on('operation', () => {
    logRemoteApply('operation')
  })

function applyRemoteOperations(testId, batch, options = {}) {
  const block = document.querySelector(`[data-testid="${testId}"]`)
  if (!block) return { applied: false }
  return editable.applyOperations(block, batch, options)
}

window.__editableE2E = {
  editable,
  editableA,
  editableB,
  logEvent,
  eventNames,
  simulatePaste,
  applyRemoteOperations
}
