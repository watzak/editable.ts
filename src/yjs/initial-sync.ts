/** Which side wins when host and Y.Text both contain different plain text. */
export type InitialSyncConflictResolution = 'host' | 'y'

export interface InitialSyncConflictContext {
  hostText: string
  yText: string
}

export interface InitialSyncConflictResolver {
  resolve(context: InitialSyncConflictContext): InitialSyncConflictResolution
}

/** Rich-text: plain text matches but inline attributes differ at initial sync. */
export type InitialIdenticalTextFormatResolution = 'copy-host-to-y' | 'copy-y-to-host' | 'error'

/** Explicit initial-sync policy — no scenario may silently discard content. */
export interface InitialSyncPolicy {
  /** Y.Text empty, host has operation text. */
  yEmptyHostFilled: 'copy-host-to-y'
  /** Host empty, Y.Text has content. */
  hostEmptyYFilled: 'copy-y-to-host'
  /** Both sides non-empty and text differs. */
  bothFilledDiffer: 'error' | InitialSyncConflictResolver
  /**
   * Rich-text only: host and Y.Text plain text match but inline attributes differ.
   * When omitted: host-only formatting → `copy-host-to-y`, Y-only → `copy-y-to-host`,
   * both formatted but different → `error`.
   */
  bothIdenticalFormatsDiffer?: InitialIdenticalTextFormatResolution
}

export type InitialSyncScenario =
  | 'both-empty'
  | 'both-identical'
  | 'y-empty-host-filled'
  | 'host-empty-y-filled'
  | 'both-filled-differ'

export function classifyInitialSync(hostText: string, yText: string): InitialSyncScenario {
  const hostEmpty = hostText.length === 0
  const yEmpty = yText.length === 0
  if (hostEmpty && yEmpty) return 'both-empty'
  if (hostEmpty && !yEmpty) return 'host-empty-y-filled'
  if (!hostEmpty && yEmpty) return 'y-empty-host-filled'
  if (hostText === yText) return 'both-identical'
  return 'both-filled-differ'
}

export class InitialSyncConflictError extends Error {
  readonly hostText: string
  readonly yText: string

  constructor(hostText: string, yText: string) {
    super('Initial sync conflict: host and Y.Text both contain different content')
    this.name = 'InitialSyncConflictError'
    this.hostText = hostText
    this.yText = yText
  }
}

export class InitialSyncFormatConflictError extends Error {
  readonly hostText: string
  readonly yText: string

  constructor(hostText: string, yText: string) {
    super(
      'Initial sync format conflict: host and Y.Text plain text match but inline attributes differ'
    )
    this.name = 'InitialSyncFormatConflictError'
    this.hostText = hostText
    this.yText = yText
  }
}
