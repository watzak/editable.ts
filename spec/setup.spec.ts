import { vi } from 'vitest'

// Vitest setup - no configuration needed
// Vitest has better default assertion truncation than Chai

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'scrollTo', {
    configurable: true,
    writable: true,
    value: vi.fn<() => void>()
  })
}

// Polyfill DataTransfer and ClipboardEvent for JSDOM (not available by default)
if (typeof globalThis.DataTransfer === 'undefined') {
  class DataTransferMock {
    items: unknown[] = []
    effectAllowed = 'all'
    dropEffect = 'none'
    files: unknown[] = []
    types: string[] = []
    _data: Record<string, string> = {}

    getData(format: string) {
      return this._data[format] || ''
    }

    setData(format: string, data: string) {
      this._data[format] = data
      if (!this.types.includes(format)) {
        this.types.push(format)
      }
    }

    clearData(format?: string) {
      if (format) {
        delete this._data[format]
        const index = this.types.indexOf(format)
        if (index > -1) {
          this.types.splice(index, 1)
        }
      } else {
        this._data = {}
        this.types = []
      }
    }
  }

  globalThis.DataTransfer = DataTransferMock as unknown as typeof DataTransfer
  if (typeof window !== 'undefined') {
    ;(window as Window & { DataTransfer: typeof DataTransfer }).DataTransfer =
      DataTransferMock as unknown as typeof DataTransfer
  }
}

if (typeof globalThis.ClipboardEvent === 'undefined') {
  class ClipboardEventMock extends Event {
    clipboardData: DataTransfer | null

    constructor(type: string, eventInitDict?: ClipboardEventInit) {
      super(type, eventInitDict)
      this.clipboardData = eventInitDict?.clipboardData || null
    }
  }

  globalThis.ClipboardEvent = ClipboardEventMock as unknown as typeof ClipboardEvent
  if (typeof window !== 'undefined') {
    ;(window as Window & { ClipboardEvent: typeof ClipboardEvent }).ClipboardEvent =
      ClipboardEventMock as unknown as typeof ClipboardEvent
  }
}
