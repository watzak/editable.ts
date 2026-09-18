export { EditableYjsBinding } from './editable-yjs-binding.js'
export type { EditableYjsBindingOptions } from './editable-yjs-binding.js'
export { EditableYjsDocumentBinding } from './editable-yjs-document-binding.js'
export type {
  DocumentBindingLifecycleState,
  EditableYjsDocumentBindingOptions
} from './editable-yjs-document-binding.js'
export {
  directiveBindingKey,
  type DocumentBindingRuntime,
  type DocumentComponentNode,
  type DocumentComponentValidation,
  type DocumentComponentView,
  type DocumentDirectiveRef,
  type EditableYjsDocumentAdapter
} from './document-adapter.js'
export {
  diffStructureSnapshots,
  parseStructureSnapshot,
  type DocumentStructureDiagnostic
} from './document-structure-sync.js'
export {
  directiveStructureSignature,
  hasDocumentStructureChanges
} from './document-structure-reconcile.js'
export {
  captureActiveDirectiveSelection,
  captureFocusedDirectiveHost,
  repositionElementAtIndex,
  resolveFocusFallbackAfterRemove,
  resolveFocusFallbackAfterTypeChange,
  resolveFocusFallbackAmongDirectives,
  restoreDirectiveSelectionFromRelative
} from './document-selection-sync.js'
export {
  applyEditableOperationsToYText,
  validateEditableOperationsForYText
} from './apply-operations-to-ytext.js'
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
  InitialSyncFormatConflictError,
  type InitialIdenticalTextFormatResolution,
  type InitialSyncConflictContext,
  type InitialSyncConflictResolution,
  type InitialSyncConflictResolver,
  type InitialSyncPolicy,
  type InitialSyncScenario
} from './initial-sync.js'
export { PlainTextYjsError } from './plain-text-yjs-error.js'
export {
  applyYTextDeltaToHostDom,
  buildCopyYTextDeltaToHostOperations,
  hostDomHasFormattingMarkup,
  hostHasInlineAttributes,
  hostRichTextMatchesYText,
  promoteHostInlineFormatsToYText,
  adoptLocalHostFormatsToYText,
  reconcileInitialRichTextFormats,
  recoverHostFromCanonicalYText,
  reconcileHostToCanonicalYText,
  yTextHasInlineAttributes
} from './reconcile.js'
export type { ReconcileAction, ReconcileDiagnostics, ReconcileHostOptions } from './reconcile.js'
export { yTextDeltaToOperations } from './ytext-delta-to-operations.js'
export type { YTextDeltaOp, YTextDeltaToOperationsOptions } from './ytext-delta-to-operations.js'
export {
  applyDeltaToText,
  buildFormatRepairOperations,
  captureCanonicalSnapshot,
  countDirectTextNodes,
  deltaChangesText,
  hostMatchesCanonicalSnapshot,
  isFullHostReplaceBatch,
  textRunsEqual,
  textRunsFromYText
} from './remote-sync-state.js'
export type {
  CanonicalSnapshot,
  RemoteSyncDiagnostics,
  RemoteSyncPath
} from './remote-sync-state.js'
export {
  InlineFormatRegistry,
  defaultInlineFormatRegistry,
  sanitizeUrlAttribute,
  isAllowedUrl
} from './inline-format-codec.js'
export type {
  InlineFormatCodec,
  FormatKey,
  FormatYjsKey,
  StandardFormatKey,
  LinkAttributeValue
} from './inline-format-codec.js'
export {
  applyHostInlineMarkupToYText,
  getBlockTextRuns,
  textRunsToPlainText
} from './dom-text-runs.js'
export type { TextRun } from './dom-text-runs.js'
export {
  applyLocalDomFormatsToYText,
  buildYTextFormatMapFromHostAttributes,
  hostTextMatchesYText,
  insertHostRunsIntoYText,
  yTextSnapshotToOperations
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
export {
  captureCompositionStartSnapshot,
  createCompositionBaseline,
  repairRichHostAfterDeferredRecovery,
  restoreSelectionFromCompositionRel,
  resolveCompositionCommitOperations,
  transformOperationsFromCompositionBaseline
} from './composition-remote-sync.js'
export type {
  CompositionBaseline,
  CompositionSelectionRel,
  CompositionStartSnapshot
} from './composition-remote-sync.js'
export {
  offsetsToRelativePositionJson,
  resolvePresenceSelection,
  resolveRelativeIndexInText
} from './relative-position.js'
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
export {
  ANNOTATIONS_ROOT_KEY,
  ANNOTATION_PAYLOAD_VERSION,
  type AnnotationLifecycleStatus,
  type AnnotationReply,
  type AnnotationType,
  type CollaborativeAnnotationRecord,
  type ComponentDeleteAnnotationPolicy,
  type ResolvedAnnotationRange,
  type SanitizedAnnotationData
} from './annotation-types.js'
export {
  buildAnnotationRecord,
  parseAnnotationRecord,
  sanitizeAnnotationAuthorId,
  sanitizeAnnotationBody,
  sanitizeAnnotationData,
  sanitizeAnnotationId,
  sanitizeIsoTimestamp
} from './annotation-payload.js'
export { AnnotationStore, getOrCreateAnnotationsMap } from './annotation-store.js'
export type { AnnotationStoreOptions } from './annotation-store.js'
export {
  coordinatedMigrateAnnotationsV1ToV2,
  type CoordinatedAnnotationMigrationOptions
} from './annotation-coordinated-migration.js'
export {
  captureAnnotationSnapshotsBeforeSplit,
  migrateAnnotationsOnMerge,
  migrateAnnotationsOnSplit,
  reencodeAnnotationPositions,
  type AnnotationSplitMigrationContext,
  type AnnotationSplitSnapshot
} from './annotation-migration.js'
export {
  DEFAULT_ANNOTATION_SPLIT_POLICY,
  normalizeAnnotationSpan,
  shouldMigrateAnnotationToSplitTarget,
  type AnnotationSplitMigrationPolicy
} from './annotation-split-policy.js'
export { parseAnnotationStorageValue } from './annotation-storage-parse.js'
export { isV2AnnotationMap, parseAnnotationRecordFromV2Map } from './annotation-crdt.js'
export { resolveAnnotationRange, resolveAnnotationsForHost } from './annotation-resolver.js'
export {
  defaultAnnotationRenderer,
  ensureAnnotationStyles,
  getOrCreateAnnotationLayer,
  removeAnnotationLayer
} from './annotation-renderer.js'
export type { AnnotationRenderer, AnnotationRendererContext } from './annotation-renderer.js'
export { EditableYjsAnnotations } from './editable-yjs-annotations.js'
export type { EditableYjsAnnotationsOptions } from './editable-yjs-annotations.js'
export { EditableYjsDocumentAnnotations } from './editable-yjs-document-annotations.js'
export type { EditableYjsDocumentAnnotationsOptions } from './editable-yjs-document-annotations.js'
export { isRelativePositionJson } from './relative-position.js'
export {
  createProviderStatusSource,
  isProviderReadyForInitialSync,
  sanitizeProviderStatus
} from './provider-status.js'
export type {
  YjsProviderConnectionStatus,
  YjsProviderStatus,
  YjsProviderStatusSource
} from './provider-status.js'
export { activateBindingsAfterProviderSync } from './sync-lifecycle.js'
export type {
  YjsSyncDiagnostic,
  YjsSyncDiagnosticHandler,
  YjsSyncDiagnosticKind
} from './sync-lifecycle.js'
