const frame = document.getElementById('editor-frame')
const eventLog = document.querySelector('[data-testid="iframe-event-log"]')
const eventNames = []

function logEvent(name) {
  eventNames.unshift(name)
  if (eventNames.length > 8) eventNames.pop()
  const value = eventNames.join(',')
  eventLog.textContent = value
  eventLog.setAttribute('data-events', value)
}

frame.addEventListener('load', async () => {
  const frameWindow = frame.contentWindow
  if (!frameWindow) return

  const { Editable } = await import('../src/core.ts')
  const editable = new Editable({ window: frameWindow, browserSpellcheck: false })

  window.__editableIframeE2E = { editable, frameWindow }

  editable.on('split', () => logEvent('split'))
  editable.on('paste', () => logEvent('paste'))
  editable.on('change', () => logEvent('change'))

  const block = frameWindow.document.querySelector('[data-testid="iframe-block"]')
  if (block) editable.add(block)
})
