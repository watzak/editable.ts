export const EDITING_INPUT_TYPES = [
  'insertParagraph',
  'insertLineBreak',
  'deleteContentBackward',
  'deleteContentForward',
  'formatBold',
  'formatItalic',
  'insertFromPaste'
] as const

export type EditingInputType = (typeof EDITING_INPUT_TYPES)[number]

export interface InputCapabilities {
  beforeInput: boolean
  editingInputTypes: ReadonlySet<EditingInputType>
}

const capabilitiesByWindow = new WeakMap<Window, InputCapabilities>()

function probeBeforeInput(doc: Document): boolean {
  if (typeof InputEvent === 'undefined') return false
  const element = doc.createElement('div')
  return 'onbeforeinput' in element && 'inputType' in InputEvent.prototype
}

export function detectInputCapabilities(win: Window): InputCapabilities {
  const beforeInput = probeBeforeInput(win.document)
  return {
    beforeInput,
    editingInputTypes: beforeInput ? new Set(EDITING_INPUT_TYPES) : new Set()
  }
}

export function getInputCapabilities(win: Window): InputCapabilities {
  let capabilities = capabilitiesByWindow.get(win)
  if (!capabilities) {
    capabilities = detectInputCapabilities(win)
    capabilitiesByWindow.set(win, capabilities)
  }
  return capabilities
}

export function isBeforeInputPreferred(
  capabilities: InputCapabilities,
  inputType: EditingInputType
): boolean {
  return capabilities.beforeInput && capabilities.editingInputTypes.has(inputType)
}
