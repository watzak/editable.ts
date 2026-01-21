import Prism from 'prismjs'

import {Editable} from '../src/core.ts'
import eventList from './events.jsx'
import {getSelectionCoordinates} from '../src/util/dom.ts'
import * as content from '../src/content.ts'
import highlightText from '../src/highlight-text.ts'

// Paragraph Example
const editable = new Editable({browserSpellcheck: false})

// Paragraph
// ---------
editable.enable('.paragraph-example p', {normalize: true})
eventList(editable)

// Text formatting toolbar
editable.enable('.formatting-example p', {normalize: true})
setupTooltip()

// Plain Text
editable.enable('.plain-text-example.example-sheet', {plainText: true})

editable.enable('.styling-example p', {normalize: true})
const secondExample = document.querySelector('.formatting-example p')
updateCode(secondExample)

editable.on('change', (elem) => {
  if (elem === secondExample) updateCode(elem)
})

// Styling
// -------
const styleSelect = document.querySelector('select[name="editable-styles"]')
if (styleSelect) {
  styleSelect.addEventListener('change', (evt) => {
    for (const el of document.querySelectorAll('.styling-example p')) {
      el.classList.remove('example-style-default', 'example-style-dark')
      el.classList.add(`example-style-${evt.target.value}`)
    }
  })
}

// Inline element
editable.add('.inline-example span')

// IFrame
// ------
const iframeExample = document.querySelector('.iframe-example')
if (iframeExample) {
  iframeExample.addEventListener('load', function () {
    const iframeWindow = this.contentWindow
    const iframeEditable = new Editable({
      window: iframeWindow
    })

    const iframeBody = this.contentDocument.body
    iframeEditable.add(iframeBody.querySelectorAll('.is-editable'))
  })
}

// Text Formatting
// ---------------

let currentSelection
function setupTooltip () {
  const tooltipWrapper = document.createElement('div')
  tooltipWrapper.innerHTML = '<div class="selection-tip" style="display:none;">' +
    `<button class="js-format js-format-bold"><img width="20" height=20" src="data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="fill: #eee"><path d="M13.5,15.5H10V12.5H13.5A1.5,1.5 0 0,1 15,14A1.5,1.5 0 0,1 13.5,15.5M10,6.5H13A1.5,1.5 0 0,1 14.5,8A1.5,1.5 0 0,1 13,9.5H10M15.6,10.79C16.57,10.11 17.25,9 17.25,8C17.25,5.74 15.5,4 13.25,4H7V18H14.04C16.14,18 17.75,16.3 17.75,14.21C17.75,12.69 16.89,11.39 15.6,10.79Z" /></svg>`)}"></button>` +
    `<button class="js-format js-format-italic"><img width="20" height=20" src="data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="fill: #eee"><path d="M10,4V7H12.21L8.79,15H6V18H14V15H11.79L15.21,7H18V4H10Z" /></svg>`)}"></button>` +
    `<button class="js-format js-format-underline"><img width="20" height=20" src="data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="fill: #eee"><path d="M5,21H19V19H5V21M12,17A6,6 0 0,0 18,11V3H15.5V11A3.5,3.5 0 0,1 12,14.5A3.5,3.5 0 0,1 8.5,11V3H6V11A6,6 0 0,0 12,17Z" /></svg>`)}"></button>` +
    `<button class="js-format js-format-link"><img width="20" height=20" src="data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="fill: #eee"><path d="M10.59,13.41C11,13.8 11,14.44 10.59,14.83C10.2,15.22 9.56,15.22 9.17,14.83C7.22,12.88 7.22,9.71 9.17,7.76V7.76L12.71,4.22C14.66,2.27 17.83,2.27 19.78,4.22C21.73,6.17 21.73,9.34 19.78,11.29L18.29,12.78C18.3,11.96 18.17,11.14 17.89,10.36L18.36,9.88C19.54,8.71 19.54,6.81 18.36,5.64C17.19,4.46 15.29,4.46 14.12,5.64L10.59,9.17C9.41,10.34 9.41,12.24 10.59,13.41M13.41,9.17C13.8,8.78 14.44,8.78 14.83,9.17C16.78,11.12 16.78,14.29 14.83,16.24V16.24L11.29,19.78C9.34,21.73 6.17,21.73 4.22,19.78C2.27,17.83 2.27,14.66 4.22,12.71L5.71,11.22C5.7,12.04 5.83,12.86 6.11,13.65L5.64,14.12C4.46,15.29 4.46,17.19 5.64,18.36C6.81,19.54 8.71,19.54 9.88,18.36L13.41,14.83C14.59,13.66 14.59,11.76 13.41,10.59C13,10.2 13,9.56 13.41,9.17Z" /></svg>`)}"></button>` +
    `<button class="js-format js-format-quote"><img width="20" height=20" src="data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="fill: #eee"><path d="M14,17H17L19,13V7H13V13H16M6,17H9L11,13V7H5V13H8L6,17Z" /></svg>`)}"></button>` +
    `<button class="js-format js-format-comment"><img width="20" height=20" src="data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" style="fill: #eee"><path d="M240-400h122l200-200q9-9 13.5-20.5T580-643q0-11-5-21.5T562-684l-36-38q-9-9-20-13.5t-23-4.5q-11 0-22.5 4.5T440-722L240-522v122Zm280-243-37-37 37 37ZM300-460v-38l101-101 20 18 18 20-101 101h-38Zm121-121 18 20-38-38 20 18Zm26 181h273v-80H527l-80 80ZM80-80v-720q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v480q0 33-23.5 56.5T800-240H240L80-80Zm126-240h594v-480H160v525l46-45Zm-46 0v-480 480Z"/></svg>`)}"></button>` +
    `<button class="js-format js-format-emoji"><img width="20" height=20" src="data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="fill: #eee"><path d="M12,2C6.47,2 2,6.5 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M15.5,8A1.5,1.5 0 0,1 17,9.5A1.5,1.5 0 0,1 15.5,11A1.5,1.5 0 0,1 14,9.5A1.5,1.5 0 0,1 15.5,8M8.5,8A1.5,1.5 0 0,1 10,9.5A1.5,1.5 0 0,1 8.5,11A1.5,1.5 0 0,1 7,9.5A1.5,1.5 0 0,1 8.5,8M12,17.5C9.67,17.5 7.69,16.04 6.89,14H17.11C16.3,16.04 14.33,17.5 12,17.5Z" /></svg>`)}"></button>` +
    `<button class="js-format js-format-whitespace"><img width="20" height=20" src="data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="fill: #eee"><path d="M3 15H5V19H19V15H21V19C21 20.1 20.1 21 19 21H5C3.9 21 3 20.1 3 19V15Z" /></svg>`)}"></button>` +
    `<button class="js-format js-format-strikethrough"><img width="20" height=20" src="data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="fill: #eee"><path d="M3,14H21V12H3M5,4V7H10V10H14V7H19V4M10,19H14V16H10V19Z" /></svg>`)}"></button>` +
    `<button class="js-format js-format-highlight"><img width="20" height=20" src="data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="fill: #eee"><path d="M12,15.5L8,19.5H4V15.5L8,11.5L12,15.5M19.08,7.42L11.5,15L10,13.5L17.58,5.92C17.85,5.65 18.3,5.65 18.58,5.92L19.08,6.42C19.35,6.7 19.35,7.15 19.08,7.42M12,8.5L8,4.5H4V8.5L8,12.5L12,8.5Z" /></svg>`)}"></button>` +
    `<button class="js-format js-format-clear"><img width="20" height=20" src="data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="fill: #eee"><path d="M16.24,3.56L21.19,8.5C21.97,9.29 21.97,10.55 21.19,11.34L12,20.53C10.44,22.09 7.91,22.09 6.34,20.53L2.81,17C2.03,16.21 2.03,14.95 2.81,14.16L13.41,3.56C14.2,2.78 15.46,2.78 16.24,3.56M4.22,15.58L7.76,19.11C8.54,19.9 9.8,19.9 10.59,19.11L14.12,15.58L9.17,10.63L4.22,15.58Z" /></svg>`)}"></button>` +
    '</div>'

  const tooltip = tooltipWrapper.firstElementChild
  document.body.appendChild(tooltip)

  editable
    .selection((el, selection) => {
      currentSelection = selection
      if (!selection) {
        tooltip.style.display = 'none'
        return
      }

      const coords = getSelectionCoordinates(window.getSelection())?.[0]
      tooltip.style.display = 'block'
      tooltip.style.position = 'fixed'

      // position tooltip
      const top = coords.top - tooltip.offsetHeight - 15
      // eslint-disable-next-line
      const left = coords.left + (coords.width / 2) - (tooltip.offsetWidth / 2)
      tooltip.style.top = `${top}px`
      tooltip.style.left = `${left}px`
    })
    .blur(() => {
      tooltip.style.display = 'none'
    })

  setupTooltipListeners(tooltip)
}

function setupTooltipListeners (tooltip) {
  // prevent editable from loosing focus
  // document
  //   .addEventListener('mousedown', (evt) => {})
  const on = (type, selector, func) => {
    for (const el of tooltip.querySelectorAll(selector)) {
      el.addEventListener(type, func)
    }
  }

  on('mousedown', '.js-format', (event) => event.preventDefault())

  on('click', '.js-format-bold', (event) => {
    if (!currentSelection.isSelection) return

    currentSelection.toggleBold()
    currentSelection.triggerChange()
  })

  on('click', '.js-format-italic', (event) => {
    if (!currentSelection.isSelection) return

    currentSelection.toggleEmphasis()
    currentSelection.triggerChange()
  })

  on('click', '.js-format-underline', (event) => {
    if (!currentSelection.isSelection) return

    currentSelection.toggleUnderline()
    currentSelection.triggerChange()
  })

  on('click', '.js-format-link', (event) => {
    if (!currentSelection.isSelection) return

    currentSelection.toggleLink('www.livingdocs.io')
    currentSelection.triggerChange()
  })

  on('click', '.js-format-quote', (event) => {
    if (!currentSelection.isSelection) return

    currentSelection.toggleSurround('«', '»')
    currentSelection.triggerChange()
  })

  on('click', '.js-format-comment', (event) => {
    if (!currentSelection.isSelection) return

    const textRange = currentSelection.getTextRange()

    currentSelection.highlightComment({textRange})
    currentSelection.triggerChange()
  })

  on('click', '.js-format-emoji', (event) => {
    if (!currentSelection.isSelection) return

    currentSelection.insertCharacter('😍')
    currentSelection.triggerChange()
  })

  on('click', '.js-format-whitespace', (event) => {
    if (!currentSelection.isSelection) return

    // insert a special whitespace 'em-space'
    currentSelection.insertCharacter(' ')
    currentSelection.triggerChange()
  })

  on('click', '.js-format-strikethrough', (event) => {
    if (!currentSelection.isSelection) return

    currentSelection.toggleCustom({
      tagName: 's',
      attributes: {}
    })
    currentSelection.triggerChange()
  })

  on('click', '.js-format-highlight', (event) => {
    if (!currentSelection.isSelection) return

    currentSelection.toggleCustom({
      tagName: 'mark',
      attributes: {class: 'text-highlight'}
    })
    currentSelection.triggerChange()
  })

  on('click', '.js-format-clear', (event) => {
    if (!currentSelection.isSelection) return

    currentSelection.removeFormatting()
    currentSelection.triggerChange()
  })
}

function updateCode (elem) {
  const elemContent = editable.getContent(elem)
  const codeBlock = document.querySelector('.formatting-code-js')
  if (!codeBlock) return
  codeBlock.textContent = elemContent.trim()
  Prism.highlightElement(codeBlock)
}

// Highlighting
// ------------

function highlightService (text, callback) {
  callback(['happy'])
}

editable.setupHighlighting({
  checkOnInit: true,
  throttle: 0,
  spellcheck: {
    marker: '<span class="highlight-spellcheck"></span>',
    spellcheckService: highlightService
  },
  whitespace: {
    marker: '<span class="highlight-whitespace"></span>'
  }
})

const highlightExample = document.querySelector('.highlighting-example p')
editable.add(highlightExample)


// Whitespace Highlighting
// -----------------------

const highlightExample2 = document.querySelector('.whitespace-highlighting-example p')
editable.add(highlightExample2)


// Pasting
// -------

editable.add('.pasting-example p')

// Text Diff
// ---------

editable.setupTextDiff({
  enabled: true,
  checkOnInit: true,
  checkOnFocus: false,
  markerDeleted: '<span class="highlight-diff-deleted"></span>',
  markerInserted: '<span class="highlight-diff-inserted"></span>',
  throttle: 300
})

editable.add('.text-diff-example p')
editable.add('.text-diff-inline-toolbar p')
editable.add('.text-diff-side-panel p')
editable.add('.text-diff-floating-card p')
editable.add('.text-diff-inline-icons p')
editable.add('.text-diff-hover-preview p')

// Text Diff - Shared Accept/Reject Logic
// ---------------------------------------

function findRelatedPair (element) {
  const pair = {
    deleted: [],
    inserted: []
  }

  // Check if element is deletion or insertion
  if (element.classList.contains('highlight-diff-deleted')) {
    pair.deleted.push(element)
    // Check adjacent siblings for insertion
    let sibling = element.nextSibling
    while (sibling) {
      if (sibling.nodeType === 1 && sibling.classList.contains('highlight-diff-inserted')) {
        pair.inserted.push(sibling)
        break
      }
      if (sibling.nodeType === 1 && !sibling.classList.contains('highlight-diff-deleted')) {
        break
      }
      sibling = sibling.nextSibling
    }
    // Check previous sibling
    sibling = element.previousSibling
    while (sibling) {
      if (sibling.nodeType === 1 && sibling.classList.contains('highlight-diff-inserted')) {
        pair.inserted.unshift(sibling)
        break
      }
      if (sibling.nodeType === 1 && !sibling.classList.contains('highlight-diff-deleted')) {
        break
      }
      sibling = sibling.previousSibling
    }
  } else if (element.classList.contains('highlight-diff-inserted')) {
    pair.inserted.push(element)
    // Check adjacent siblings for deletion
    let sibling = element.previousSibling
    while (sibling) {
      if (sibling.nodeType === 1 && sibling.classList.contains('highlight-diff-deleted')) {
        pair.deleted.unshift(sibling)
        break
      }
      if (sibling.nodeType === 1 && !sibling.classList.contains('highlight-diff-inserted')) {
        break
      }
      sibling = sibling.previousSibling
    }
    // Check next sibling
    sibling = element.nextSibling
    while (sibling) {
      if (sibling.nodeType === 1 && sibling.classList.contains('highlight-diff-deleted')) {
        pair.deleted.push(sibling)
        break
      }
      if (sibling.nodeType === 1 && !sibling.classList.contains('highlight-diff-inserted')) {
        break
      }
      sibling = sibling.nextSibling
    }
  }

  return pair
}

function acceptChange (pair, highlight) {
  if (!pair || !highlight) return

  const editableHost = highlight.closest('p') || highlight.closest('.text-diff-inline-toolbar') ||
                       highlight.closest('.text-diff-side-panel') || highlight.closest('.text-diff-floating-card') ||
                       highlight.closest('.text-diff-inline-icons')
  if (!editableHost) return

  // Unwrap insertion markers (keep the text)
  pair.inserted.forEach(insertedEl => {
    if (insertedEl.parentNode && insertedEl.isConnected) {
      content.unwrap(insertedEl)
    }
  })

  // Remove deletion markers (remove the text)
  pair.deleted.forEach(deletedEl => {
    if (deletedEl.isConnected) {
      deletedEl.remove()
    }
  })

  // Update original text in textDiff
  if (editable.textDiff) {
    const newText = highlightText.extractText(editableHost)
    editable.textDiff.setOriginalText(editableHost, newText)
  }

  // Normalize DOM
  editableHost.normalize()

  // Trigger change event
  editable.dispatcher.notify('change', editableHost)
}

function rejectChange (pair, highlight) {
  if (!pair || !highlight) return

  const editableHost = highlight.closest('p') || highlight.closest('.text-diff-inline-toolbar') ||
                       highlight.closest('.text-diff-side-panel') || highlight.closest('.text-diff-floating-card') ||
                       highlight.closest('.text-diff-inline-icons')
  if (!editableHost) return

  // Unwrap deletion markers (keep the text)
  pair.deleted.forEach(deletedEl => {
    if (deletedEl.parentNode && deletedEl.isConnected) {
      content.unwrap(deletedEl)
    }
  })

  // Remove insertion markers (remove the text)
  pair.inserted.forEach(insertedEl => {
    if (insertedEl.isConnected) {
      insertedEl.remove()
    }
  })

  // Update original text in textDiff
  if (editable.textDiff) {
    const newText = highlightText.extractText(editableHost)
    editable.textDiff.setOriginalText(editableHost, newText)
  }

  // Normalize DOM
  editableHost.normalize()

  // Trigger change event
  editable.dispatcher.notify('change', editableHost)
}

// Text Diff Popover (Original)
// -----------------

function setupTextDiffPopover () {
  const popover = document.createElement('div')
  popover.className = 'text-diff-popover'
  popover.innerHTML = `
    <button class="text-diff-accept">Accept</button>
    <button class="text-diff-reject">Reject</button>
  `
  popover.style.display = 'none'
  document.body.appendChild(popover)

  let currentHighlight = null
  let currentPair = null

  function findRelatedPairLocal (element) {
    const pair = {
      deleted: [],
      inserted: []
    }

    // Check if element is deletion or insertion
    if (element.classList.contains('highlight-diff-deleted')) {
      pair.deleted.push(element)
      // Check adjacent siblings for insertion
      let sibling = element.nextSibling
      while (sibling) {
        if (sibling.nodeType === 1 && sibling.classList.contains('highlight-diff-inserted')) {
          pair.inserted.push(sibling)
          break
        }
        if (sibling.nodeType === 1 && !sibling.classList.contains('highlight-diff-deleted')) {
          break
        }
        sibling = sibling.nextSibling
      }
      // Check previous sibling
      sibling = element.previousSibling
      while (sibling) {
        if (sibling.nodeType === 1 && sibling.classList.contains('highlight-diff-inserted')) {
          pair.inserted.unshift(sibling)
          break
        }
        if (sibling.nodeType === 1 && !sibling.classList.contains('highlight-diff-deleted')) {
          break
        }
        sibling = sibling.previousSibling
      }
    } else if (element.classList.contains('highlight-diff-inserted')) {
      pair.inserted.push(element)
      // Check adjacent siblings for deletion
      let sibling = element.previousSibling
      while (sibling) {
        if (sibling.nodeType === 1 && sibling.classList.contains('highlight-diff-deleted')) {
          pair.deleted.unshift(sibling)
          break
        }
        if (sibling.nodeType === 1 && !sibling.classList.contains('highlight-diff-inserted')) {
          break
        }
        sibling = sibling.previousSibling
      }
      // Check next sibling
      sibling = element.nextSibling
      while (sibling) {
        if (sibling.nodeType === 1 && sibling.classList.contains('highlight-diff-deleted')) {
          pair.deleted.push(sibling)
          break
        }
        if (sibling.nodeType === 1 && !sibling.classList.contains('highlight-diff-inserted')) {
          break
        }
        sibling = sibling.nextSibling
      }
    }

    return pair
  }

  function showPopover (element) {
    currentHighlight = element
    currentPair = findRelatedPairLocal(element)

    // Don't show if no pair found
    if (currentPair.deleted.length === 0 && currentPair.inserted.length === 0) {
      return
    }

    const rect = element.getBoundingClientRect()
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft

    // Show popover first to get its dimensions
    popover.style.display = 'block'
    const popoverRect = popover.getBoundingClientRect()

    // Position popover above the element by default
    let top = (rect.top + scrollTop) - (popoverRect.height + 8)
    let left = (rect.left + scrollLeft) + ((rect.width / 2) - (popoverRect.width / 2))

    // Adjust if popover would go off screen horizontally
    if (left < (scrollLeft + 8)) {
      left = scrollLeft + 8
    } else if ((left + popoverRect.width) > ((scrollLeft + window.innerWidth) - 8)) {
      left = ((scrollLeft + window.innerWidth) - popoverRect.width) - 8
    }

    // Adjust if popover would go off screen vertically (above)
    if (top < scrollTop) {
      // Position below instead
      top = rect.bottom + scrollTop + 8
      popover.classList.add('popover-below')
    } else {
      popover.classList.remove('popover-below')
    }

    popover.style.left = `${left}px`
    popover.style.top = `${top}px`
  }

  function hidePopover () {
    popover.style.display = 'none'
    currentHighlight = null
    currentPair = null
  }

  function handleAccept () {
    acceptChange(currentPair, currentHighlight)
    hidePopover()
  }

  function handleReject () {
    rejectChange(currentPair, currentHighlight)
    hidePopover()
  }

  // Event listeners
  const textDiffExample = document.querySelector('.text-diff-example')
  if (textDiffExample) {
    let hideTimeout = null

    function showPopoverDelayed (element) {
      if (hideTimeout) {
        clearTimeout(hideTimeout)
        hideTimeout = null
      }
      showPopover(element)
    }

    function hidePopoverDelayed () {
      if (hideTimeout) {
        clearTimeout(hideTimeout)
      }
      hideTimeout = setTimeout(() => {
        if (!popover.matches(':hover') &&
            !textDiffExample.querySelector(':hover')?.classList?.contains('highlight-diff-deleted') &&
            !textDiffExample.querySelector(':hover')?.classList?.contains('highlight-diff-inserted')) {
          hidePopover()
        }
      }, 150)
    }

    textDiffExample.addEventListener('mouseover', (e) => {
      const target = e.target
      if (target.nodeType === 1 &&
          (target.classList.contains('highlight-diff-deleted') ||
           target.classList.contains('highlight-diff-inserted'))) {
        showPopoverDelayed(target)
      }
    }, true)

    textDiffExample.addEventListener('mouseout', (e) => {
      const target = e.target
      if (target.nodeType === 1 &&
          (target.classList.contains('highlight-diff-deleted') ||
           target.classList.contains('highlight-diff-inserted'))) {
        hidePopoverDelayed()
      }
    }, true)

    popover.addEventListener('mouseenter', () => {
      if (hideTimeout) {
        clearTimeout(hideTimeout)
        hideTimeout = null
      }
    })

    popover.addEventListener('mouseleave', () => {
      hidePopoverDelayed()
    })
  }

  // Button click handlers
  popover.querySelector('.text-diff-accept')?.addEventListener('click', handleAccept)
  popover.querySelector('.text-diff-reject')?.addEventListener('click', handleReject)
}

setupTextDiffPopover()

// Text Diff - Four UI Styles
// ---------------------------

// 1. Inline Toolbar
function setupInlineToolbar () {
  const container = document.querySelector('.text-diff-inline-toolbar')
  if (!container) return

  const toolbar = document.createElement('div')
  toolbar.className = 'text-diff-toolbar'
  toolbar.innerHTML = `
    <button class="text-diff-reject">Reject</button>
    <button class="text-diff-accept">Accept</button>
    
  `
  toolbar.style.display = 'none'
  document.body.appendChild(toolbar)

  let currentHighlight = null
  let currentPair = null
  let hideTimeout = null

  function showToolbar (element) {
    currentHighlight = element
    currentPair = findRelatedPair(element)
    // Toolbar should always show when hovering over deleted or inserted text
    // Accept: keeps inserted text, removes deleted text
    // Reject: keeps deleted text, removes inserted text

    if (hideTimeout) clearTimeout(hideTimeout)
    const rect = element.getBoundingClientRect()
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft

    toolbar.style.display = 'block'
    const toolbarRect = toolbar.getBoundingClientRect()
    let top = (rect.top + scrollTop) - (toolbarRect.height + 8)
    let left = (rect.left + scrollLeft) + ((rect.width / 2) - (toolbarRect.width / 2))

    if (left < scrollLeft + 8) left = scrollLeft + 8
    if ((left + toolbarRect.width) > ((scrollLeft + window.innerWidth) - 8)) {
      left = ((scrollLeft + window.innerWidth) - toolbarRect.width) - 8
    }
    if (top < scrollTop) {
      top = rect.bottom + scrollTop + 8
      toolbar.classList.add('toolbar-below')
    } else {
      toolbar.classList.remove('toolbar-below')
    }

    toolbar.style.left = `${left}px`
    toolbar.style.top = `${top}px`
  }

  function hideToolbar () {
    if (hideTimeout) clearTimeout(hideTimeout)
    hideTimeout = setTimeout(() => {
      if (!toolbar.matches(':hover') &&
          !container.querySelector(':hover')?.classList?.contains('highlight-diff-deleted') &&
          !container.querySelector(':hover')?.classList?.contains('highlight-diff-inserted')) {
        toolbar.style.display = 'none'
        currentHighlight = null
        currentPair = null
      }
    }, 150)
  }

  container.addEventListener('mouseover', (e) => {
    const target = e.target
    if (target.nodeType === 1 &&
        (target.classList.contains('highlight-diff-deleted') ||
         target.classList.contains('highlight-diff-inserted'))) {
      showToolbar(target)
    }
  }, true)

  container.addEventListener('mouseout', (e) => {
    const target = e.target
    if (target.nodeType === 1 &&
        (target.classList.contains('highlight-diff-deleted') ||
         target.classList.contains('highlight-diff-inserted'))) {
      hideToolbar()
    }
  }, true)

  toolbar.addEventListener('mouseenter', () => {
    if (hideTimeout) clearTimeout(hideTimeout)
  })

  toolbar.addEventListener('mouseleave', hideToolbar)

  toolbar.querySelector('.text-diff-accept')?.addEventListener('click', () => {
    acceptChange(currentPair, currentHighlight)
    toolbar.style.display = 'none'
  })

  toolbar.querySelector('.text-diff-reject')?.addEventListener('click', () => {
    rejectChange(currentPair, currentHighlight)
    toolbar.style.display = 'none'
  })
}

// 2. Side Panel
function setupSidePanel () {
  const wrapper = document.querySelector('.text-diff-side-panel-wrapper')
  const container = document.querySelector('.text-diff-side-panel')
  const panel = document.querySelector('.text-diff-side-panel-ui')
  if (!wrapper || !container || !panel) return

  let pairs = []

  function updatePanel () {
    const allHighlights = container.querySelectorAll('.highlight-diff-deleted, .highlight-diff-inserted')
    const processedElements = new Set()
    const uniquePairs = []

    // Group highlights into unique pairs
    Array.from(allHighlights).forEach(el => {
      // Skip if this element was already processed as part of another pair
      if (processedElements.has(el)) return

      const pair = findRelatedPair(el)
      const deletedText = pair.deleted.map(e => e.textContent).join('')
      const insertedText = pair.inserted.map(e => e.textContent).join('')

      // Skip if pair has no changes
      if (pair.deleted.length === 0 && pair.inserted.length === 0) return

      // Mark all elements in this pair as processed
      pair.deleted.forEach(e => processedElements.add(e))
      pair.inserted.forEach(e => processedElements.add(e))

      // Use first element as representative for acceptChange/rejectChange
      const representativeElement = pair.deleted[0] || pair.inserted[0]

      uniquePairs.push({
        pair,
        representativeElement,
        deletedText,
        insertedText
      })
    })

    pairs = uniquePairs

    panel.innerHTML = pairs.length > 0 ? `
      <div class="side-panel-header">Changes (${pairs.length})</div>
      ${pairs.map((pairData, idx) => `
        <div class="side-panel-item" data-index="${idx}">
          <div class="side-panel-text">
            ${pairData.deletedText ? `<div class="side-panel-deleted"><span class="side-panel-label">Deleted:</span> <span class="side-panel-content">${pairData.deletedText}</span></div>` : ''}
            ${pairData.insertedText ? `<div class="side-panel-inserted"><span class="side-panel-label">Inserted:</span> <span class="side-panel-content">${pairData.insertedText}</span></div>` : ''}
          </div>
          <div class="side-panel-actions">
            <button class="text-diff-accept" data-index="${idx}">Accept</button>
            <button class="text-diff-reject" data-index="${idx}">Reject</button>
          </div>
        </div>
      `).join('')}
    ` : '<div class="side-panel-empty">No changes</div>'

    panel.querySelectorAll('.text-diff-accept').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index)
        const pairData = pairs[idx]
        if (pairData) {
          acceptChange(pairData.pair, pairData.representativeElement)
          updatePanel()
        }
      })
    })

    panel.querySelectorAll('.text-diff-reject').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index)
        const pairData = pairs[idx]
        if (pairData) {
          rejectChange(pairData.pair, pairData.representativeElement)
          updatePanel()
        }
      })
    })
  }

  container.addEventListener('mouseover', (e) => {
    const target = e.target
    if (target.nodeType === 1 &&
        (target.classList.contains('highlight-diff-deleted') ||
         target.classList.contains('highlight-diff-inserted'))) {
      updatePanel()
    }
  }, true)

  updatePanel()
}

// 3. Floating Card
function setupFloatingCard () {
  const container = document.querySelector('.text-diff-floating-card')
  if (!container) return

  const card = document.createElement('div')
  card.className = 'text-diff-card'
  card.style.display = 'none'
  document.body.appendChild(card)

  let currentHighlight = null
  let currentPair = null
  let hideTimeout = null

  function showCard (element) {
    currentHighlight = element
    currentPair = findRelatedPair(element)
    if (currentPair.deleted.length === 0 && currentPair.inserted.length === 0) return

    if (hideTimeout) clearTimeout(hideTimeout)
    const rect = element.getBoundingClientRect()
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft

    const deletedText = currentPair.deleted.map(el => el.textContent).join('')
    const insertedText = currentPair.inserted.map(el => el.textContent).join('')

    card.innerHTML = `
      <div class="card-header">Change Summary</div>
      ${deletedText ? `<div class="card-change"><span class="card-label deleted">Deleted:</span> <span class="card-text">${deletedText}</span></div>` : ''}
      ${insertedText ? `<div class="card-change"><span class="card-label inserted">Inserted:</span> <span class="card-text">${insertedText}</span></div>` : ''}
      <div class="card-actions">
        <button class="text-diff-accept">Accept</button>
        <button class="text-diff-reject">Reject</button>
      </div>
    `

    card.style.display = 'block'
    const cardRect = card.getBoundingClientRect()
    let top = (rect.top + scrollTop) - (cardRect.height + 12)
    let left = (rect.left + scrollLeft) + ((rect.width / 2) - (cardRect.width / 2))

    if (left < scrollLeft + 8) left = scrollLeft + 8
    if ((left + cardRect.width) > ((scrollLeft + window.innerWidth) - 8)) {
      left = ((scrollLeft + window.innerWidth) - cardRect.width) - 8
    }
    if (top < scrollTop) {
      top = rect.bottom + scrollTop + 12
    }

    card.style.left = `${left}px`
    card.style.top = `${top}px`
  }

  function hideCard () {
    if (hideTimeout) clearTimeout(hideTimeout)
    hideTimeout = setTimeout(() => {
      if (!card.matches(':hover') &&
          !container.querySelector(':hover')?.classList?.contains('highlight-diff-deleted') &&
          !container.querySelector(':hover')?.classList?.contains('highlight-diff-inserted')) {
        card.style.display = 'none'
        currentHighlight = null
        currentPair = null
      }
    }, 150)
  }

  container.addEventListener('mouseover', (e) => {
    const target = e.target
    if (target.nodeType === 1 &&
        (target.classList.contains('highlight-diff-deleted') ||
         target.classList.contains('highlight-diff-inserted'))) {
      showCard(target)
    }
  }, true)

  container.addEventListener('mouseout', (e) => {
    const target = e.target
    if (target.nodeType === 1 &&
        (target.classList.contains('highlight-diff-deleted') ||
         target.classList.contains('highlight-diff-inserted'))) {
      hideCard()
    }
  }, true)

  card.addEventListener('mouseenter', () => {
    if (hideTimeout) clearTimeout(hideTimeout)
  })

  card.addEventListener('mouseleave', hideCard)

  card.addEventListener('click', (e) => {
    if (e.target.classList.contains('text-diff-accept')) {
      acceptChange(currentPair, currentHighlight)
      card.style.display = 'none'
    } else if (e.target.classList.contains('text-diff-reject')) {
      rejectChange(currentPair, currentHighlight)
      card.style.display = 'none'
    }
  })
}

// 4. In-Place Icons (Improved Side-by-Side)
function setupInlineIcons () {
  const container = document.querySelector('.text-diff-inline-icons')
  if (!container) return

  let currentHighlight = null
  let currentPair = null
  let currentDiffBlock = null
  let hideTimeout = null

  function createDiffBlock (element) {
    hideDiffBlock()
    currentHighlight = element
    currentPair = findRelatedPair(element)
    if (currentPair.deleted.length === 0 && currentPair.inserted.length === 0) return

    const deletedText = currentPair.deleted.map(el => el.textContent).join('')
    const insertedText = currentPair.inserted.map(el => el.textContent).join('')

    // Get position of the first element in the pair
    const firstElement = currentPair.deleted[0] || currentPair.inserted[0]
    if (!firstElement) return

    const rect = firstElement.getBoundingClientRect()
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft

    const diffBlock = document.createElement('div')
    diffBlock.className = 'text-diff-inline-block'
    diffBlock.innerHTML = `
      <div class="diff-block-content">
        <div class="diff-deleted-text">
          <span class="diff-label">Deleted:</span>
          <span class="diff-text deleted">${deletedText}</span>
        </div>
        <div class="diff-icons-bar">
          <button class="icon-accept" title="Accept change" aria-label="Accept">✓</button>
          <button class="icon-reject" title="Reject change" aria-label="Reject">✕</button>
        </div>
        <div class="diff-inserted-text">
          <span class="diff-label">Inserted:</span>
          <span class="diff-text inserted">${insertedText}</span>
        </div>
      </div>
    `
    diffBlock.style.position = 'absolute'
    diffBlock.style.left = `${rect.left + scrollLeft}px`
    diffBlock.style.top = `${rect.bottom + scrollTop + 8}px`
    diffBlock.style.zIndex = '10000'
    document.body.appendChild(diffBlock)

    // Adjust if would go off screen
    const blockRect = diffBlock.getBoundingClientRect()
    if (blockRect.right > window.innerWidth - 8) {
      diffBlock.style.left = `${(scrollLeft + window.innerWidth) - blockRect.width - 8}px`
    }
    if (blockRect.bottom > window.innerHeight - 8) {
      diffBlock.style.top = `${(rect.top + scrollTop) - blockRect.height - 8}px`
    }

    diffBlock.querySelector('.icon-accept')?.addEventListener('click', (e) => {
      e.stopPropagation()
      acceptChange(currentPair, currentHighlight)
      hideDiffBlock()
    })

    diffBlock.querySelector('.icon-reject')?.addEventListener('click', (e) => {
      e.stopPropagation()
      rejectChange(currentPair, currentHighlight)
      hideDiffBlock()
    })

    currentDiffBlock = diffBlock
    firstElement._diffBlock = diffBlock
  }

  function hideDiffBlock () {
    if (hideTimeout) clearTimeout(hideTimeout)
    container.querySelectorAll('.highlight-diff-deleted, .highlight-diff-inserted').forEach(el => {
      if (el._diffBlock) {
        delete el._diffBlock
      }
    })
    if (currentDiffBlock) {
      currentDiffBlock.remove()
      currentDiffBlock = null
    }
    currentHighlight = null
    currentPair = null
  }

  container.addEventListener('mouseover', (e) => {
    const target = e.target
    if (target.nodeType === 1 &&
        (target.classList.contains('highlight-diff-deleted') ||
         target.classList.contains('highlight-diff-inserted'))) {
      if (hideTimeout) clearTimeout(hideTimeout)
      createDiffBlock(target)
    }
  }, true)

  container.addEventListener('mouseout', (e) => {
    const target = e.target
    if (target.nodeType === 1 &&
        (target.classList.contains('highlight-diff-deleted') ||
         target.classList.contains('highlight-diff-inserted'))) {
      hideTimeout = setTimeout(() => {
        if (!currentDiffBlock?.matches(':hover') &&
            !container.querySelector(':hover')?.classList?.contains('highlight-diff-deleted') &&
            !container.querySelector(':hover')?.classList?.contains('highlight-diff-inserted')) {
          hideDiffBlock()
        }
      }, 150)
    }
  }, true)

  // Keep diff block visible when hovering over it
  document.addEventListener('mouseover', (e) => {
    if (e.target.closest('.text-diff-inline-block')) {
      if (hideTimeout) clearTimeout(hideTimeout)
    }
  })
}

// 5. Hover Preview
function setupHoverPreview () {
  const container = document.querySelector('.text-diff-hover-preview')
  if (!container) return

  const popover = document.createElement('div')
  popover.className = 'text-diff-preview-popover'
  popover.style.display = 'none'
  document.body.appendChild(popover)

  let currentHighlight = null
  let currentPair = null
  let hideTimeout = null

  function showPreview (element) {
    if (!element.classList.contains('highlight-diff-deleted')) return

    currentHighlight = element
    currentPair = findRelatedPair(element)

    // Only show if there's a related insertion
    if (currentPair.inserted.length === 0) {
      return
    }

    if (hideTimeout) clearTimeout(hideTimeout)

    const insertedText = currentPair.inserted.map(el => el.textContent).join('')

    popover.innerHTML = `
      <div class="preview-content">
        <div class="preview-inserted">
          <span class="preview-text inserted-text">${insertedText}</span>
        </div>
      </div>
    `

    const rect = element.getBoundingClientRect()
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft

    popover.style.display = 'block'
    const popoverRect = popover.getBoundingClientRect()

    // Position below the deleted text
    let top = (rect.bottom + scrollTop) + 8
    let left = (rect.left + scrollLeft) + ((rect.width / 2) - (popoverRect.width / 2))

    // Adjust if popover would go off screen horizontally
    if (left < (scrollLeft + 8)) {
      left = scrollLeft + 8
    } else if ((left + popoverRect.width) > ((scrollLeft + window.innerWidth) - 8)) {
      left = (((scrollLeft + window.innerWidth) - popoverRect.width) - 8)
    }

    // If no space below, position above
    if ((top + popoverRect.height) > ((scrollTop + window.innerHeight) - 8)) {
      top = ((rect.top + scrollTop) - popoverRect.height) - 8
      popover.classList.add('preview-above')
    } else {
      popover.classList.remove('preview-above')
    }

    // Ensure popover doesn't go above viewport
    if (top < scrollTop) {
      top = scrollTop + 8
    }

    popover.style.left = `${left}px`
    popover.style.top = `${top}px`
  }

  function hidePreview () {
    if (hideTimeout) clearTimeout(hideTimeout)
    hideTimeout = setTimeout(() => {
      if (!popover.matches(':hover') &&
          !container.querySelector(':hover')?.classList?.contains('highlight-diff-deleted')) {
        popover.style.display = 'none'
        currentHighlight = null
        currentPair = null
      }
    }, 150)
  }

  container.addEventListener('mouseover', (e) => {
    const target = e.target
    if (target.nodeType === 1 && target.classList.contains('highlight-diff-deleted')) {
      showPreview(target)
    }
  }, true)

  container.addEventListener('mouseout', (e) => {
    const target = e.target
    if (target.nodeType === 1 && target.classList.contains('highlight-diff-deleted')) {
      hidePreview()
    }
  }, true)

  popover.addEventListener('mouseenter', () => {
    if (hideTimeout) clearTimeout(hideTimeout)
  })

  popover.addEventListener('mouseleave', hidePreview)

  popover.addEventListener('click', (e) => {
    // Clicking anywhere on the popover accepts the change
    e.stopPropagation()
    acceptChange(currentPair, currentHighlight)
    popover.style.display = 'none'
  })
}

// Initialize all UI styles
setupInlineToolbar()
setupSidePanel()
setupFloatingCard()
setupInlineIcons()
setupHoverPreview()
