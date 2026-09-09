/** Which side wins when host and Y.Text both contain different plain text. */
export type InitialSyncConflictResolution = 'host' | 'y'

export interface InitialSyncConflictContext {
  hostText: string
  yText: string
}

export interface InitialSyncConflictResolver {
  resolve(context: InitialSyncConflictContext): InitialSyncConflictResolution
}

/** Explicit initial-sync policy — no scenario may silently discard content. */
export interface InitialSyncPolicy {
  /** Y.Text empty, host has operation text. */
  yEmptyHostFilled: 'copy-host-to-y'
  /** Host empty, Y.Text has content. */
  hostEmptyYFilled: 'copy-y-to-host'
  /** Both sides non-empty and text differs. */
  bothFilledDiffer: 'error' | InitialSyncConflictResolver
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
