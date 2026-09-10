import type { DocumentComponentNode, EditableYjsDocumentAdapter } from './document-adapter.js'
import { directiveBindingKey } from './document-adapter.js'
import { diffStructureSnapshots, parseStructureSnapshot } from './document-structure-sync.js'

/** Stable signature of mounted directive slots (component id + directive key only). */
export function directiveStructureSignature(
  directives: ReturnType<typeof parseStructureSnapshot>['directives']
): string {
  return directives
    .map((ref) => directiveBindingKey(ref.componentId, ref.directiveKey))
    .sort()
    .join('|')
}

/** True when component tree or directive slots differ from the last reconciled snapshot. */
export function hasDocumentStructureChanges(
  adapter: EditableYjsDocumentAdapter,
  root: unknown,
  previousNodes: ReadonlyMap<string, DocumentComponentNode>,
  previousDirectiveSignature: string
): boolean {
  const snapshot = parseStructureSnapshot(adapter, root)
  const diff = diffStructureSnapshots(previousNodes, snapshot.nodes)
  if (diff.some((entry) => entry.kind !== 'unchanged')) return true
  return directiveStructureSignature(snapshot.directives) !== previousDirectiveSignature
}
