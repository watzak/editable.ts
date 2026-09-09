/** Stable transaction origin token for one {@link EditableYjsBinding} instance. */
export type BindingTransactionOrigin = { readonly editableYjsBinding: string }

/** Non-undoable origin for initial sync copies (excluded from {@link Y.UndoManager}). */
export type InitialSyncTransactionOrigin = { readonly editableYjsInitialSync: true }

export function createBindingTransactionOrigin(): BindingTransactionOrigin {
  return { editableYjsBinding: crypto.randomUUID() }
}

export const INITIAL_SYNC_ORIGIN: InitialSyncTransactionOrigin = {
  editableYjsInitialSync: true
}

export function isBindingTransactionOrigin(
  origin: unknown,
  bindingOrigin: BindingTransactionOrigin
): boolean {
  return origin === bindingOrigin
}

export function isInitialSyncOrigin(origin: unknown): origin is InitialSyncTransactionOrigin {
  return (
    typeof origin === 'object' &&
    origin !== null &&
    (origin as InitialSyncTransactionOrigin).editableYjsInitialSync === true
  )
}
