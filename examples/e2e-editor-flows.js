import { Editable } from '../src/features.ts'
import { getSelectionCoordinates } from '../src/util/dom.ts'

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

function isParagraphExample(elem) {
  return elem.closest('.e2e-paragraph-example, .e2e-merge-example') != null
}

function isPasteExample(elem) {
  return elem.closest('.e2e-pasting-example') != null
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

setupTooltip()

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

// Paste example
editable.enable('.e2e-pasting-example p', { normalize: true })

editable.on('paste', (elem) => {
  if (!isPasteExample(elem)) return
  logEvent('paste')
})

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

window.__editableE2E = { editable, logEvent, eventNames }
