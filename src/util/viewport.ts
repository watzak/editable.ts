// code from mdn: https://developer.mozilla.org/en-US/docs/Web/API/window.scrollX
function getScrollPosition(win: Window): { x: number; y: number } {
  const scrollElement = win.document.documentElement || win.document.body
  const x = win.pageXOffset !== undefined ? win.pageXOffset : scrollElement.scrollLeft
  const y = win.pageYOffset !== undefined ? win.pageYOffset : scrollElement.scrollTop
  return { x, y }
}

export { getScrollPosition }
