export { EditableYjsBinding } from './editable-yjs-binding.js'
export type { EditableYjsBindingOptions } from './editable-yjs-binding.js'
export { applyEditableOperationsToYText } from './apply-operations-to-ytext.js'
export {
  createBindingTransactionOrigin,
  INITIAL_SYNC_ORIGIN,
  isBindingTransactionOrigin,
  isInitialSyncOrigin
} from './binding-origin.js'
export type { BindingTransactionOrigin, InitialSyncTransactionOrigin } from './binding-origin.js'
export {
  resolveBindingUndoOptions,
  shouldStopCapturing,
  UNDO_SELECTION_META_KEY,
  YjsBindingUndoController
} from './binding-undo.js'
export type { BindingUndoOptions, YjsBindingUndoStatus } from './binding-undo.js'
export type {
  EditableYjsStructuralAdapter,
  StructuralAcceptedResult,
  StructuralBlockContext,
  StructuralDeferResult,
  StructuralInsertBlockIntent,
  StructuralIntentResult,
  StructuralIntentStatus,
  StructuralMergeIntent,
  StructuralPasteIntent,
  StructuralRejectedResult,
  StructuralSplitIntent
} from './structural-adapter.js'
export {
  applyDeltaSegments,
  mergeYTextIntoTarget,
  moveYTextTailToTarget,
  splitYTextDeltaAt
} from './structural-ytext.js'
export type { YTextDeltaSegment } from './structural-ytext.js'
export {
  classifyInitialSync,
  InitialSyncConflictError,
  type InitialSyncConflictContext,
  type InitialSyncConflictResolution,
  type InitialSyncConflictResolver,
  type InitialSyncPolicy,
  type InitialSyncScenario
} from './initial-sync.js'
export { PlainTextYjsError } from './plain-text-yjs-error.js'
export { reconcileHostToCanonicalYText } from './reconcile.js'
export type { ReconcileDiagnostics } from './reconcile.js'
export { yTextDeltaToOperations } from './ytext-delta-to-operations.js'
export type { YTextDeltaOp, YTextDeltaToOperationsOptions } from './ytext-delta-to-operations.js'
export {
  InlineFormatRegistry,
  defaultInlineFormatRegistry,
  sanitizeUrlAttribute,
  isAllowedUrl
} from './inline-format-codec.js'
export type { InlineFormatCodec, FormatYjsKey, LinkAttributeValue } from './inline-format-codec.js'
export { getBlockTextRuns, textRunsToPlainText } from './dom-text-runs.js'
export type { TextRun } from './dom-text-runs.js'
export {
  insertHostRunsIntoYText,
  yTextSnapshotToOperations,
  hostTextMatchesYText
} from './dom-to-ytext.js'
export {
  buildToggleFormatOperation,
  buildLinkOperation,
  buildUnlinkOperation
} from '../format-operations.js'
export type { ToggleFormatKey } from '../format-operations.js'
export { EditableYjsPresence } from './editable-yjs-presence.js'
export type { EditableYjsPresenceOptions, PresenceUser } from './editable-yjs-presence.js'
export {
  buildPresencePayload,
  parsePresencePayload,
  sanitizePresenceColor,
  sanitizePresenceName,
  isPresenceOnlyAwarenessState,
  PRESENCE_STATE_KEY,
  PRESENCE_PAYLOAD_VERSION
} from './presence-payload.js'
export type { PresencePayloadV1 } from './presence-payload.js'
export { offsetsToRelativePositionJson, resolvePresenceSelection } from './relative-position.js'
export type { ResolvedPresenceSelection } from './relative-position.js'
export {
  defaultPresenceRenderer,
  ensurePresenceStyles,
  getOrCreatePresenceLayer,
  removePresenceLayer
} from './presence-renderer.js'
export type {
  PresenceRenderer,
  PresenceRendererContext,
  RemotePresenceView
} from './presence-renderer.js'
