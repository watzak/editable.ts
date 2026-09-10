import type {
  DocumentComponentNode,
  DocumentComponentValidation,
  DocumentDirectiveRef,
  EditableYjsDocumentAdapter
} from './document-adapter.js'

export interface DocumentStructureDiagnostic {
  componentId: string
  reason: string
  detail?: string
}

export interface ParsedStructureSnapshot {
  nodes: Map<string, DocumentComponentNode>
  directives: DocumentDirectiveRef[]
  diagnostics: DocumentStructureDiagnostic[]
}

export function placementKey(node: DocumentComponentNode): string {
  return `${node.parentComponentId ?? 'root'}:${node.containerId ?? ''}:${node.siblingIndex}:${node.componentId}`
}

export function mountPlacementKey(node: DocumentComponentNode): string {
  return `${node.parentComponentId ?? 'root'}:${node.containerId ?? ''}:${node.siblingIndex}`
}

/** Reads adapter structure, skipping invalid components without throwing. */
export function parseStructureSnapshot(
  adapter: EditableYjsDocumentAdapter,
  root: unknown
): ParsedStructureSnapshot {
  const diagnostics: DocumentStructureDiagnostic[] = []
  const nodes = new Map<string, DocumentComponentNode>()

  if (adapter.listComponentsWithValidation) {
    for (const entry of adapter.listComponentsWithValidation(root)) {
      if (entry.status === 'invalid') {
        diagnostics.push({
          componentId: entry.componentId,
          reason: entry.reason,
          detail: entry.detail
        })
        continue
      }
      nodes.set(entry.node.componentId, entry.node)
    }
  } else if (adapter.listComponents) {
    for (const node of adapter.listComponents(root)) {
      nodes.set(node.componentId, node)
    }
  }

  const directives: DocumentDirectiveRef[] = []
  for (const ref of adapter.listDirectives(root)) {
    if (!nodes.has(ref.componentId)) {
      diagnostics.push({
        componentId: ref.componentId,
        reason: 'directive-without-component',
        detail: ref.directiveKey
      })
      continue
    }
    directives.push(ref)
  }

  return { nodes, directives, diagnostics }
}

export type StructureDiffKind = 'insert' | 'remove' | 'move' | 'typeChange' | 'unchanged'

export interface StructureDiffEntry {
  componentId: string
  kind: StructureDiffKind
  previous?: DocumentComponentNode
  next?: DocumentComponentNode
}

export function diffStructureSnapshots(
  previous: ReadonlyMap<string, DocumentComponentNode>,
  next: ReadonlyMap<string, DocumentComponentNode>
): StructureDiffEntry[] {
  const diff: StructureDiffEntry[] = []

  for (const [componentId, node] of next.entries()) {
    const old = previous.get(componentId)
    if (!old) {
      diff.push({ componentId, kind: 'insert', next: node })
      continue
    }
    if (old.componentType !== node.componentType) {
      diff.push({ componentId, kind: 'typeChange', previous: old, next: node })
    } else if (
      old.parentComponentId !== node.parentComponentId ||
      old.containerId !== node.containerId ||
      old.siblingIndex !== node.siblingIndex
    ) {
      diff.push({ componentId, kind: 'move', previous: old, next: node })
    } else {
      diff.push({ componentId, kind: 'unchanged', previous: old, next: node })
    }
  }

  for (const [componentId, node] of previous.entries()) {
    if (!next.has(componentId)) {
      diff.push({ componentId, kind: 'remove', previous: node })
    }
  }

  return diff
}

export type DocumentComponentValidationResult = DocumentComponentValidation
