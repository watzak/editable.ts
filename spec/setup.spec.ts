// Vitest setup - no configuration needed
// Vitest has better default assertion truncation than Chai

// Polyfill DataTransfer and ClipboardEvent for JSDOM (not available by default)
if (typeof globalThis.DataTransfer === 'undefined') {
  class DataTransferMock {
    constructor() {
      this.items = []
      this.effectAllowed = 'all'
      this.dropEffect = 'none'
      this.files = []
      this.types = []
      this._data = {}
    }

    getData(format) {
      return this._data[format] || ''
    }

    setData(format, data) {
      this._data[format] = data
      if (!this.types.includes(format)) {
        this.types.push(format)
      }
    }

    clearData(format) {
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

  globalThis.DataTransfer = DataTransferMock
  // Also set on window for browser compatibility
  if (typeof window !== 'undefined') {
    (window as any).DataTransfer = DataTransferMock
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

  globalThis.ClipboardEvent = ClipboardEventMock as any
  if (typeof window !== 'undefined') {
    (window as any).ClipboardEvent = ClipboardEventMock
  }
}
