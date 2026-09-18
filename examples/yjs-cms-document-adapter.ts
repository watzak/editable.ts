/**
 * Example CMS document adapter — NOT a required public schema.
 *
 * Demonstrates component/directive/container model:
 *   root: Y.Array<Component>
 *   Component: Y.Map { id, type, content: Y.Map<string, Y.Text>, properties, containers }
 *
 *   `properties` (e.g. heading level) are read only in renderComponent — remote property
 *   changes do not auto-update DOM; integrator must remount or patch (see DOCUMENT_ADAPTER_CONTRACT.md).
 */
import * as Y from 'yjs'
import * as content from '../src/content.js'
import { EditableYjsBinding } from '../src/yjs/index.js'
import type {
  DocumentBindingRuntime,
  DocumentComponentNode,
  DocumentComponentValidation,
  DocumentComponentView,
  DocumentDirectiveRef,
  EditableYjsDocumentAdapter
} from '../src/yjs/document-adapter.js'
import type {
  EditableYjsStructuralAdapter,
  StructuralBlockContext,
  StructuralIntentResult
} from '../src/yjs/structural-adapter.js'
import { insertHostRunsIntoYText } from '../src/yjs/dom-to-ytext.js'
import { mergeYTextIntoTarget, moveYTextTailToTarget } from '../src/yjs/structural-ytext.js'

export const CMS_DOCUMENT_ROOT_KEY = 'editable.ts:example:cms-document'

/** Parses one pasted HTML block into {@link Y.Text} runs (no regex tag stripping). */
function insertPastedHtmlIntoYText(yText: Y.Text, html: string, doc: Document): void {
  const sandbox = doc.createElement('div')
  sandbox.setAttribute('data-plaintext', 'false')
  const fragment = content.createFragmentFromString(html, doc)
  sandbox.appendChild(fragment)
  content.tidyHtml(sandbox)
  if (yText.length > 0) {
    yText.delete(0, yText.length)
  }
  insertHostRunsIntoYText(yText, sandbox, doc)
}

export type CmsComponentType = 'paragraph' | 'heading' | 'quote' | 'two-column'

export interface CmsComponentRecord {
  id: string
  type: CmsComponentType
  map: Y.Map<unknown>
  array: Y.Array<Y.Map<unknown>>
  index: number
}

const TEXT_DIRECTIVE_KEYS = ['body', 'title', 'lead'] as const

function directiveKeysForComponentType(type: CmsComponentType): readonly string[] {
  switch (type) {
    case 'paragraph':
    case 'heading':
      return ['body']
    case 'quote':
      return ['title', 'body']
    case 'two-column':
      return []
  }
}
const CMS_COMPONENT_TYPES = new Set<CmsComponentType>([
  'paragraph',
  'heading',
  'quote',
  'two-column'
])
const COLUMN_CHILDREN = new Set<CmsComponentType>(['paragraph', 'heading', 'quote'])

export function validateCmsComponentRecord(
  map: unknown,
  context: {
    parentComponentId?: string
    parentType?: CmsComponentType
    containerId?: string
    siblingIndex: number
  }
): DocumentComponentValidation {
  if (!(map instanceof Y.Map)) {
    return { status: 'invalid', componentId: 'unknown', reason: 'not-a-map' }
  }
  const id = map.get('id')
  const type = map.get('type')
  if (typeof id !== 'string' || id.length === 0) {
    return { status: 'invalid', componentId: 'unknown', reason: 'missing-id' }
  }
  if (typeof type !== 'string' || !CMS_COMPONENT_TYPES.has(type as CmsComponentType)) {
    return {
      status: 'invalid',
      componentId: id,
      reason: 'unknown-type',
      detail: typeof type === 'string' ? type : undefined
    }
  }
  const typed = type as CmsComponentType
  if (context.parentType === 'two-column' && context.containerId) {
    if (!COLUMN_CHILDREN.has(typed)) {
      return {
        status: 'invalid',
        componentId: id,
        reason: 'child-not-allowed',
        detail: `${context.containerId}:${typed}`
      }
    }
  }
  return {
    status: 'valid',
    node: {
      componentId: id,
      componentType: typed,
      parentComponentId: context.parentComponentId,
      containerId: context.containerId,
      siblingIndex: context.siblingIndex
    }
  }
}

export function listCmsComponentsWithValidation(
  root: Y.Array<Y.Map<unknown>>
): DocumentComponentValidation[] {
  const results: DocumentComponentValidation[] = []

  function walkArray(
    array: Y.Array<Y.Map<unknown>>,
    parentComponentId: string | undefined,
    containerId: string | undefined,
    parentType: CmsComponentType | undefined
  ): void {
    for (let index = 0; index < array.length; index += 1) {
      const map = array.get(index)
      const validation = validateCmsComponentRecord(map, {
        parentComponentId,
        parentType,
        containerId,
        siblingIndex: index
      })
      results.push(validation)
      if (validation.status !== 'valid') continue

      const containers = map instanceof Y.Map ? map.get('containers') : null
      if (containers instanceof Y.Map && validation.node.componentType === 'two-column') {
        containers.forEach((childArray, key) => {
          const arr = asComponentArray(childArray)
          if (!arr) return
          walkArray(
            arr,
            validation.node.componentId,
            String(key),
            validation.node.componentType as CmsComponentType
          )
        })
      }
    }
  }

  walkArray(root, undefined, undefined, undefined)
  return results
}

export function createCmsDocumentRoot(doc: Y.Doc): Y.Array<Y.Map<unknown>> {
  return doc.getArray(CMS_DOCUMENT_ROOT_KEY)
}

/** Direct handles returned at creation time — Y.Map.get requires doc integration. */
export interface CmsComponentHandles {
  map: Y.Map<unknown>
  content: Y.Map<unknown>
  properties: Y.Map<unknown>
  containers: Y.Map<unknown>
  /** Primary body Y.Text when the component type defines one. */
  body?: Y.Text
  title?: Y.Text
}

export function createCmsComponentMap(
  type: CmsComponentType,
  id: string = crypto.randomUUID()
): Y.Map<unknown> {
  return createCmsComponentHandles(type, id).map
}

export function createCmsComponentHandles(
  type: CmsComponentType,
  id: string = crypto.randomUUID()
): CmsComponentHandles {
  const map = new Y.Map<unknown>()
  const contentMap = new Y.Map<unknown>()
  const propertiesMap = new Y.Map<unknown>()
  const containersMap = new Y.Map<unknown>()
  const handles: CmsComponentHandles = {
    map,
    content: contentMap,
    properties: propertiesMap,
    containers: containersMap
  }

  map.set('id', id)
  map.set('type', type)
  map.set('content', contentMap)
  map.set('properties', propertiesMap)
  map.set('containers', containersMap)

  switch (type) {
    case 'paragraph':
    case 'heading': {
      const body = new Y.Text()
      contentMap.set('body', body)
      handles.body = body
      if (type === 'heading') propertiesMap.set('level', 2)
      break
    }
    case 'quote': {
      const title = new Y.Text()
      const body = new Y.Text()
      contentMap.set('title', title)
      contentMap.set('body', body)
      handles.title = title
      handles.body = body
      break
    }
    case 'two-column':
      containersMap.set('left', new Y.Array<Y.Map<unknown>>())
      containersMap.set('right', new Y.Array<Y.Map<unknown>>())
      break
  }

  return handles
}

export function insertCmsComponent(
  array: Y.Array<Y.Map<unknown>>,
  type: CmsComponentType,
  index: number = array.length,
  id?: string
): CmsComponentHandles {
  const handles = createCmsComponentHandles(type, id)
  const doc = array.doc
  if (doc) {
    doc.transact(() => {
      array.insert(index, [handles.map])
    })
  } else {
    array.insert(index, [handles.map])
  }
  return handles
}

function copyYTextDelta(source: Y.Text, target: Y.Text): void {
  for (const op of source.toDelta()) {
    if (typeof op.insert === 'string') {
      target.insert(target.length, op.insert, op.attributes)
    }
  }
}

/** Deep-copy one integrated component map (Yjs cannot re-insert detached nested maps). */
export function cloneCmsComponentMap(source: Y.Map<unknown>): CmsComponentHandles {
  const type = source.get('type') as CmsComponentType
  const id = source.get('id') as string
  const handles = createCmsComponentHandles(type, id)

  const fromContent = source.get('content')
  if (fromContent instanceof Y.Map) {
    fromContent.forEach((value, key) => {
      if (value instanceof Y.Text) {
        const target = handles.content.get(String(key))
        if (target instanceof Y.Text) copyYTextDelta(value, target)
      }
    })
  }

  const fromProps = source.get('properties')
  if (fromProps instanceof Y.Map) {
    fromProps.forEach((value, key) => {
      handles.properties.set(String(key), value)
    })
  }

  const fromContainers = source.get('containers')
  if (fromContainers instanceof Y.Map) {
    fromContainers.forEach((childArray, key) => {
      if (!(childArray instanceof Y.Array)) return
      const targetArray = handles.containers.get(String(key))
      if (!(targetArray instanceof Y.Array)) return
      for (let i = 0; i < childArray.length; i += 1) {
        const child = childArray.get(i)
        if (child instanceof Y.Map) {
          targetArray.insert(targetArray.length, [cloneCmsComponentMap(child).map])
        }
      }
    })
  }

  return handles
}

function asComponentArray(node: unknown): Y.Array<Y.Map<unknown>> | null {
  return node instanceof Y.Array ? (node as Y.Array<Y.Map<unknown>>) : null
}

function walkComponents(
  array: Y.Array<Y.Map<unknown>>,
  parentComponentId: string | undefined,
  containerId: string | undefined,
  parentType: CmsComponentType | undefined,
  visit: (
    record: CmsComponentRecord,
    refs: DocumentDirectiveRef[],
    parentId?: string,
    container?: string,
    parentComponentType?: CmsComponentType
  ) => void
): void {
  for (let index = 0; index < array.length; index += 1) {
    const map = array.get(index)
    if (!(map instanceof Y.Map)) continue
    const id = map.get('id')
    const type = map.get('type')
    if (typeof id !== 'string' || typeof type !== 'string') continue
    if (!CMS_COMPONENT_TYPES.has(type as CmsComponentType)) continue

    const record: CmsComponentRecord = { id, type: type as CmsComponentType, map, array, index }
    const refs: DocumentDirectiveRef[] = []

    const contentMap = map.get('content')
    if (contentMap instanceof Y.Map) {
      for (const key of directiveKeysForComponentType(type as CmsComponentType)) {
        const value = contentMap.get(key)
        if (value instanceof Y.Text) {
          refs.push({
            componentId: id,
            componentType: type,
            directiveKey: key,
            parentComponentId,
            containerId,
            siblingIndex: index,
            yText: value
          })
        }
      }
    }

    visit(record, refs, parentComponentId, containerId, parentType)

    const containers = map.get('containers')
    if (containers instanceof Y.Map) {
      containers.forEach((childArray, key) => {
        const arr = asComponentArray(childArray)
        if (!arr) return
        walkComponents(arr, id, String(key), record.type, visit)
      })
    }
  }
}

export function listCmsDirectives(root: Y.Array<Y.Map<unknown>>): DocumentDirectiveRef[] {
  const refs: DocumentDirectiveRef[] = []
  walkComponents(root, undefined, undefined, undefined, (_record, componentRefs) => {
    refs.push(...componentRefs)
  })
  return refs
}

export function listCmsComponents(root: Y.Array<Y.Map<unknown>>): DocumentComponentNode[] {
  const nodes: DocumentComponentNode[] = []
  walkComponents(root, undefined, undefined, undefined, (record, _refs, parentId, containerId) => {
    nodes.push({
      componentId: record.id,
      componentType: record.type,
      parentComponentId: parentId,
      containerId,
      siblingIndex: record.index
    })
  })
  return nodes
}

export function findCmsComponentByYText(
  root: Y.Array<Y.Map<unknown>>,
  yText: Y.Text
): CmsComponentRecord | null {
  let found: CmsComponentRecord | null = null
  walkComponents(root, undefined, undefined, undefined, (record, refs) => {
    if (found) return
    if (refs.some((ref) => ref.yText === yText)) found = record
  })
  return found
}

export function findCmsDirectiveRef(
  root: Y.Array<Y.Map<unknown>>,
  yText: Y.Text
): DocumentDirectiveRef | null {
  const refs = listCmsDirectives(root)
  return refs.find((ref) => ref.yText === yText) ?? null
}

export interface CmsDocumentAdapterOptions {
  mountContainer: HTMLElement
  createHost?: () => HTMLElement
  /** Test/diagnostic hook — invoked once per destroyed component view. */
  onDestroyComponentView?: (view: DocumentComponentView) => void
}

function ensureCmsContentForType(
  type: CmsComponentType,
  contentMap: Y.Map<unknown>,
  propertiesMap: Y.Map<unknown>,
  containersMap: Y.Map<unknown>
): void {
  switch (type) {
    case 'paragraph':
    case 'heading': {
      if (!(contentMap.get('body') instanceof Y.Text)) {
        contentMap.set('body', new Y.Text())
      }
      if (type === 'heading' && !propertiesMap.has('level')) {
        propertiesMap.set('level', 2)
      }
      break
    }
    case 'quote': {
      if (!(contentMap.get('title') instanceof Y.Text)) {
        contentMap.set('title', new Y.Text())
      }
      if (!(contentMap.get('body') instanceof Y.Text)) {
        contentMap.set('body', new Y.Text())
      }
      break
    }
    case 'two-column': {
      if (!(containersMap.get('left') instanceof Y.Array)) {
        containersMap.set('left', new Y.Array<Y.Map<unknown>>())
      }
      if (!(containersMap.get('right') instanceof Y.Array)) {
        containersMap.set('right', new Y.Array<Y.Map<unknown>>())
      }
      break
    }
  }
}

export function changeCmsComponentType(
  root: Y.Array<Y.Map<unknown>>,
  componentId: string,
  newType: CmsComponentType,
  origin?: unknown
): boolean {
  let record: CmsComponentRecord | null = null
  walkComponents(root, undefined, undefined, undefined, (candidate) => {
    if (candidate.id === componentId) record = candidate
  })
  if (!record) return false
  const doc = root.doc
  if (!doc) return false

  doc.transact(() => {
    record!.map.set('type', newType)
    const contentMap = record!.map.get('content')
    const propertiesMap = record!.map.get('properties')
    const containersMap = record!.map.get('containers')
    if (
      contentMap instanceof Y.Map &&
      propertiesMap instanceof Y.Map &&
      containersMap instanceof Y.Map
    ) {
      ensureCmsContentForType(newType, contentMap, propertiesMap, containersMap)
      for (const key of TEXT_DIRECTIVE_KEYS) {
        if (!directiveKeysForComponentType(newType).includes(key)) {
          contentMap.delete(key)
        }
      }
    }
  }, origin)
  return true
}

export function createCmsDocumentAdapter(
  options: CmsDocumentAdapterOptions
): EditableYjsDocumentAdapter {
  const { mountContainer } = options
  const containerMounts = new Map<string, Map<string, HTMLElement>>()

  function createHost(): HTMLElement {
    if (options.createHost) return options.createHost()
    const host = document.createElement('div')
    host.setAttribute('contenteditable', 'true')
    host.setAttribute('data-plaintext', 'false')
    return host
  }

  function renderComponentView(
    record: CmsComponentRecord,
    mountParent: HTMLElement,
    siblingIndex: number
  ): DocumentComponentView {
    const { id, type, map } = record
    const rootElement = document.createElement('div')
    rootElement.className = `cms-component cms-${type}`
    rootElement.dataset.componentId = id
    rootElement.dataset.componentType = type

    const directiveHosts = new Map<string, HTMLElement>()

    if (mountParent.children.length > siblingIndex) {
      mountParent.insertBefore(rootElement, mountParent.children[siblingIndex])
    } else {
      mountParent.appendChild(rootElement)
    }

    const contentMap = map.get('content') as Y.Map<unknown>

    switch (type) {
      case 'paragraph': {
        const host = createHost()
        host.dataset.directiveKey = 'body'
        rootElement.appendChild(host)
        directiveHosts.set('body', host)
        break
      }
      case 'heading': {
        const level = (map.get('properties') as Y.Map<unknown>)?.get('level')
        const tag = typeof level === 'number' ? `h${level}` : 'h2'
        const heading = document.createElement(tag)
        const host = createHost()
        host.dataset.directiveKey = 'body'
        heading.appendChild(host)
        rootElement.appendChild(heading)
        directiveHosts.set('body', host)
        break
      }
      case 'quote': {
        const block = document.createElement('blockquote')
        const titleHost = createHost()
        titleHost.dataset.directiveKey = 'title'
        titleHost.className = 'cms-quote-title'
        const bodyHost = createHost()
        bodyHost.dataset.directiveKey = 'body'
        bodyHost.className = 'cms-quote-body'
        block.appendChild(titleHost)
        block.appendChild(bodyHost)
        rootElement.appendChild(block)
        if (contentMap?.get('title') instanceof Y.Text) directiveHosts.set('title', titleHost)
        if (contentMap?.get('body') instanceof Y.Text) directiveHosts.set('body', bodyHost)
        break
      }
      case 'two-column': {
        const row = document.createElement('div')
        row.className = 'cms-two-column-row'
        const left = document.createElement('div')
        left.className = 'cms-column cms-column-left'
        left.dataset.containerId = 'left'
        const right = document.createElement('div')
        right.className = 'cms-column cms-column-right'
        right.dataset.containerId = 'right'
        row.appendChild(left)
        row.appendChild(right)
        rootElement.appendChild(row)
        containerMounts.set(
          id,
          new Map([
            ['left', left],
            ['right', right]
          ])
        )
        break
      }
    }

    return { componentId: id, componentType: type, rootElement, directiveHosts }
  }

  function insertParagraphRelative(
    runtime: DocumentBindingRuntime,
    ctx: StructuralBlockContext,
    array: Y.Array<Y.Map<unknown>>,
    index: number,
    direction: 'before' | 'after'
  ): StructuralIntentResult {
    runtime.stopUndoCapturing()
    const insertIndex = direction === 'before' ? index : index + 1
    const created = createCmsComponentHandles('paragraph')
    ctx.doc.transact(() => {
      array.insert(insertIndex, [created.map])
    }, runtime.transactionOrigin)
    runtime.remountStructure()
    const newId = created.map.get('id') as string
    const view = runtime.getComponentView(newId)
    const host = view?.directiveHosts.get('body')
    if (!host) return { status: 'rejected', reason: 'mount-failed' }
    return {
      status: 'accepted',
      focusHost: host,
      selection: { anchor: 0, head: 0, direction: 'none' },
      newBlockId: newId
    }
  }

  function adapterFactory(runtime: DocumentBindingRuntime): EditableYjsStructuralAdapter {
    const root = runtime.root as Y.Array<Y.Map<unknown>>

    return {
      splitBlock(ctx, intent): StructuralIntentResult {
        const directive = findCmsDirectiveRef(root, ctx.yText)
        const record = findCmsComponentByYText(root, ctx.yText)
        if (!record || !directive || directive.directiveKey !== 'body') {
          return { status: 'rejected', reason: 'unsupported-split-target' }
        }
        if (record.type !== 'paragraph' && record.type !== 'heading') {
          return { status: 'rejected', reason: 'unsupported-component-type' }
        }

        runtime.stopUndoCapturing()
        const created = createCmsComponentHandles('paragraph')
        const newMap = created.map
        const newBody = created.body!

        ctx.doc.transact(() => {
          record.array.insert(record.index + 1, [newMap])
          moveYTextTailToTarget(ctx.yText, intent.offset, newBody)
        }, runtime.transactionOrigin)

        const fragment = content.createFragmentFromString(
          intent.htmlBefore,
          ctx.host.ownerDocument!
        )
        ctx.host.innerHTML = ''
        ctx.host.appendChild(fragment)
        content.tidyHtml(ctx.host)

        runtime.remountStructure()
        const newId = newMap.get('id') as string
        const view = runtime.getComponentView(newId)
        const newHost = view?.directiveHosts.get('body')
        if (!newHost) return { status: 'rejected', reason: 'mount-failed' }

        return {
          status: 'accepted',
          focusHost: newHost,
          selection: { anchor: 0, head: 0, direction: 'none' },
          newBlockId: newId
        }
      },

      mergeBlock(ctx, intent): StructuralIntentResult {
        const record = findCmsComponentByYText(root, ctx.yText)
        if (!record) return { status: 'rejected', reason: 'component-not-found' }

        const siblingIndex = intent.direction === 'before' ? record.index - 1 : record.index + 1
        if (siblingIndex < 0 || siblingIndex >= record.array.length) {
          return { status: 'rejected', reason: 'no-sibling' }
        }

        const siblingMap = record.array.get(siblingIndex)
        const siblingBody = (siblingMap?.get('content') as Y.Map<unknown>)?.get('body')
        if (!(siblingBody instanceof Y.Text)) {
          return { status: 'rejected', reason: 'invalid-sibling' }
        }

        runtime.stopUndoCapturing()
        const mergeOffset = siblingBody.length
        const removeIndex = record.index

        ctx.doc.transact(() => {
          if (intent.direction === 'before') {
            mergeYTextIntoTarget(siblingBody, ctx.yText)
            record.array.delete(removeIndex, 1)
          } else {
            mergeYTextIntoTarget(ctx.yText, siblingBody)
            record.array.delete(siblingIndex, 1)
          }
        }, runtime.transactionOrigin)

        runtime.remountStructure()

        const targetId =
          intent.direction === 'before'
            ? (siblingMap!.get('id') as string)
            : (record.map.get('id') as string)
        const binding = runtime.getDirectiveBinding(targetId, 'body')
        binding?.reconcile('structural-merge')
        const view = runtime.getComponentView(targetId)
        const host = view?.directiveHosts.get('body')
        if (!host) return { status: 'rejected', reason: 'mount-failed' }

        return {
          status: 'accepted',
          focusHost: host,
          selection: { anchor: mergeOffset, head: mergeOffset, direction: 'none' }
        }
      },

      insertBlock(ctx, intent): StructuralIntentResult {
        const record = findCmsComponentByYText(root, ctx.yText)
        if (!record) return { status: 'rejected', reason: 'component-not-found' }
        return insertParagraphRelative(runtime, ctx, record.array, record.index, intent.direction)
      },

      pasteBlocks(ctx, intent): StructuralIntentResult {
        const record = findCmsComponentByYText(root, ctx.yText)
        if (!record) return { status: 'rejected', reason: 'component-not-found' }

        runtime.stopUndoCapturing()
        const newMaps: Y.Map<unknown>[] = []
        const doc = ctx.host.ownerDocument!
        ctx.doc.transact(() => {
          if (intent.offset < ctx.yText.length) {
            ctx.yText.delete(intent.offset, ctx.yText.length - intent.offset)
          }

          let insertAt = record.index + 1
          for (const blockHtml of intent.blocks) {
            const created = createCmsComponentHandles('paragraph')
            if (created.body) {
              insertPastedHtmlIntoYText(created.body, blockHtml, doc)
            }
            record.array.insert(insertAt, [created.map])
            newMaps.push(created.map)
            insertAt += 1
          }
        }, runtime.transactionOrigin)

        const prefixFragment = content.createFragmentFromString(
          intent.command.cursor.htmlBefore ?? '',
          doc
        )
        ctx.host.innerHTML = ''
        ctx.host.appendChild(prefixFragment)
        content.tidyHtml(ctx.host)

        runtime.remountStructure()
        const first = newMaps[0]
        const firstId = first?.get('id') as string | undefined
        const view = firstId ? runtime.getComponentView(firstId) : undefined
        const host = view?.directiveHosts.get('body') ?? ctx.host
        return {
          status: 'accepted',
          focusHost: host,
          selection: { anchor: 0, head: 0, direction: 'none' },
          newBlockId: firstId
        }
      }
    }
  }

  return {
    getRoot(doc) {
      return createCmsDocumentRoot(doc)
    },

    listDirectives(root) {
      return listCmsDirectives(root as Y.Array<Y.Map<unknown>>)
    },

    listComponents(root) {
      return listCmsComponents(root as Y.Array<Y.Map<unknown>>)
    },

    listComponentsWithValidation(root) {
      return listCmsComponentsWithValidation(root as Y.Array<Y.Map<unknown>>)
    },

    getComponentMountParent(node, _root, mounted) {
      if (node.parentComponentId && node.containerId) {
        const column = containerMounts.get(node.parentComponentId)?.get(node.containerId)
        if (column) return column
        const parentView = mounted.get(node.parentComponentId)
        if (parentView) return parentView.rootElement
      }
      return mountContainer
    },

    renderComponent(componentId, componentType, root, mountParent, siblingIndex) {
      const array = root as Y.Array<Y.Map<unknown>>
      let record: CmsComponentRecord | null = null
      walkComponents(array, undefined, undefined, undefined, (candidate) => {
        if (candidate.id === componentId) record = candidate
      })
      if (!record) {
        throw new Error(`CMS adapter: component ${componentId} not found in CRDT`)
      }
      return renderComponentView(record, mountParent, siblingIndex)
    },

    destroyComponentView(view) {
      containerMounts.delete(view.componentId)
      options.onDestroyComponentView?.(view)
    },

    createStructuralAdapter(runtime) {
      return adapterFactory(runtime)
    },

    observeStructure(root, onChange) {
      const array = root as Y.Array<Y.Map<unknown>>
      const deepHandler = () => onChange()
      array.observeDeep(deepHandler)
      return () => array.unobserveDeep(deepHandler)
    },

    createComponentId() {
      return crypto.randomUUID()
    },

    resolveDirective(root, yText) {
      return findCmsDirectiveRef(root as Y.Array<Y.Map<unknown>>, yText)
    }
  }
}

/**
 * Example API helpers — move/delete are app-level CRDT ops, not core library commands.
 *
 * **Warning:** This move implementation **clones** the component map and deletes the source
 * entry, which creates **new** `Y.Text` instances. Concurrent edits targeting the pre-move body
 * will not appear on the moved component after sync. Production CMS code must preserve shared
 * `Y.Text` identity or merge explicitly — see `docs/adr/002-structural-edit-concurrency.md`
 * and `spec/yjs-p0-baseline.spec.ts` (move gate).
 */
export function moveCmsComponent(
  root: Y.Array<Y.Map<unknown>>,
  componentId: string,
  targetArray: Y.Array<Y.Map<unknown>>,
  targetIndex: number,
  origin?: unknown
): boolean {
  let source: CmsComponentRecord | null = null
  walkComponents(root, undefined, undefined, undefined, (record) => {
    if (record.id === componentId) source = record
  })
  if (!source) return false
  const doc = root.doc
  if (!doc) return false
  doc.transact(() => {
    const fromArray = source!.array
    const fromIndex = source!.index
    const map = fromArray.get(fromIndex)
    if (!(map instanceof Y.Map)) return

    const clone = cloneCmsComponentMap(map)
    fromArray.delete(fromIndex, 1)
    targetArray.insert(targetIndex, [clone.map])
  }, origin)
  return true
}

export function deleteCmsComponent(
  root: Y.Array<Y.Map<unknown>>,
  componentId: string,
  origin?: unknown
): boolean {
  let source: CmsComponentRecord | null = null
  walkComponents(root, undefined, undefined, undefined, (record) => {
    if (record.id === componentId) source = record
  })
  if (!source) return false
  const doc = root.doc
  if (!doc) return false
  doc.transact(() => {
    source!.array.delete(source!.index, 1)
  }, origin)
  return true
}

export type { EditableYjsBinding }
