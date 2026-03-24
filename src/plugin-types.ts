export type TimeoutHandle = ReturnType<typeof setTimeout>

export interface PendingEditableTimeout {
  id?: TimeoutHandle
  editableHost?: HTMLElement
}

export type SpellcheckResult = string[] | null | undefined
export type SpellcheckServiceCallback = (misspelledWords?: SpellcheckResult) => void
export type SpellcheckServiceHandler = (text: string, callback: SpellcheckServiceCallback) => void
export type SpellcheckCheckCallback = (error: null, misspelledWords?: string[] | null) => void

export interface HighlightMarkerConfig {
  marker?: string
}

export interface MonitoredSpellcheckConfig extends HighlightMarkerConfig {
  throttle?: number
  spellcheckService?: SpellcheckServiceHandler
}

export interface MonitoredWhitespaceConfig extends HighlightMarkerConfig {}

export interface MonitoredHighlightingConfig {
  checkOnInit?: boolean
  checkOnFocus?: boolean
  checkOnChange?: boolean
  throttle?: number
  removeOnCorrection?: boolean
  spellcheck?: MonitoredSpellcheckConfig
  whitespace?: MonitoredWhitespaceConfig
}

export interface ResolvedMonitoredSpellcheckConfig {
  marker: string
  throttle: number
  spellcheckService: SpellcheckServiceHandler
}

export interface ResolvedMonitoredWhitespaceConfig {
  marker: string
}

export interface ResolvedMonitoredHighlightingConfig {
  checkOnInit: boolean
  checkOnFocus: boolean
  checkOnChange: boolean
  throttle: number
  removeOnCorrection: boolean
  spellcheck: ResolvedMonitoredSpellcheckConfig
  whitespace: ResolvedMonitoredWhitespaceConfig
}

export interface SpellcheckSetupConfig {
  markerNode?: HTMLElement
  throttle?: number
  spellcheckService: SpellcheckServiceHandler
}
