/** Stable transaction origin token for one {@link EditableYjsBinding} instance. */
export type BindingTransactionOrigin = { readonly editableYjsBinding: string }

export function createBindingTransactionOrigin(): BindingTransactionOrigin {
  return { editableYjsBinding: crypto.randomUUID() }
}

export function isBindingTransactionOrigin(
  origin: unknown,
  bindingOrigin: BindingTransactionOrigin
): boolean {
  return origin === bindingOrigin
}
