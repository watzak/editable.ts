export function getBrowserWindow(): Window | undefined {
  if (typeof globalThis === 'undefined') return undefined
  const candidate = globalThis.window
  return candidate?.document ? candidate : undefined
}

export function getBrowserDocument(): Document | undefined {
  return getBrowserWindow()?.document
}

export function requireBrowserWindow(context = 'Editable'): Window {
  const win = getBrowserWindow()
  if (!win?.document) {
    throw new Error(
      `${context} requires a browser Window with document. Pass { window } or instantiate client-side after mount.`
    )
  }
  return win
}
