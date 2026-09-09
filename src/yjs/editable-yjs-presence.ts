import * as Y from 'yjs'
import type { Awareness } from 'y-protocols/awareness'
import type { Editable } from '../core.js'
import { getOperationTextLength } from '../operation-offset.js'
import { captureSelectionSnapshot } from '../operation-selection.js'
import {
  buildPresencePayload,
  parsePresencePayload,
  PRESENCE_STATE_KEY,
  type PresencePayloadV1
} from './presence-payload.js'
import { offsetsToRelativePositionJson, resolvePresenceSelection } from './relative-position.js'
import {
  defaultPresenceRenderer,
  ensurePresenceStyles,
  getOrCreatePresenceLayer,
  removePresenceLayer,
  type PresenceRenderer,
  type RemotePresenceView
} from './presence-renderer.js'

export interface PresenceUser {
  name: string
  color: string
}

export interface EditableYjsPresenceOptions {
  editable: Editable
  host: HTMLElement
  yText: Y.Text
  /** User-supplied Awareness instance — this module never creates a provider. */
  awareness: Awareness
  user: PresenceUser
  /** When false, local state is still published but nothing is rendered. Default: true */
  renderCursors?: boolean
  renderer?: PresenceRenderer
  /** Minimum interval between local awareness publishes (ms). Default: 50 */
  throttleMs?: number
  /** Clear local selection from awareness when the host blurs. Default: true */
  hideOnBlur?: boolean
  /** Override prefers-reduced-motion detection. */
  reducedMotion?: boolean
}

type AwarenessChangeHandler = (changes: {
  added: number[]
  updated: number[]
  removed: number[]
}) => void

/**
 * Optional remote selection/caret rendering via y-protocols Awareness.
 *
 * Does not mutate host HTML or Y.Text — overlays only.
 */
export class EditableYjsPresence {
  readonly editable: Editable
  readonly host: HTMLElement
  readonly yText: Y.Text
  readonly awareness: Awareness

  private destroyed = false
  private readonly renderer: PresenceRenderer
  private readonly throttleMs: number
  private readonly hideOnBlur: boolean
  private readonly renderCursors: boolean
  private readonly user: PresenceUser
  private readonly reducedMotion: boolean

  private hostFocused = false
  private throttleTimer: ReturnType<typeof setTimeout> | null = null
  private pendingPublish = false
  private readonly doc: Document
  private readonly win: Window

  private readonly onAwarenessChange: AwarenessChangeHandler
  private readonly onSelectionChange: () => void
  private readonly onHostFocus: () => void
  private readonly onHostBlur: () => void
  private readonly onScrollOrResize: () => void
  private readonly onYTextChange: () => void
  private disconnectObserver: MutationObserver | null = null

  constructor(options: EditableYjsPresenceOptions) {
    validatePresenceOptions(options)

    this.editable = options.editable
    this.host = options.host
    this.yText = options.yText
    this.awareness = options.awareness
    this.user = options.user
    this.renderer = options.renderer ?? { render: defaultPresenceRenderer }
    this.throttleMs = options.throttleMs ?? 50
    this.hideOnBlur = options.hideOnBlur !== false
    this.renderCursors = options.renderCursors !== false
    this.doc = options.host.ownerDocument
    this.win = this.doc.defaultView ?? options.editable.win
    this.reducedMotion =
      options.reducedMotion ??
      this.win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ??
      false

    this.onAwarenessChange = () => {
      this.scheduleRender()
    }
    this.onSelectionChange = () => {
      this.schedulePublish()
    }
    this.onHostFocus = () => {
      this.hostFocused = true
      this.schedulePublish()
    }
    this.onHostBlur = () => {
      this.hostFocused = false
      if (this.hideOnBlur) {
        this.publishLocalPresence(null)
      } else {
        this.schedulePublish()
      }
    }
    this.onScrollOrResize = () => {
      this.scheduleRender()
    }
    this.onYTextChange = () => {
      this.scheduleRender()
    }

    ensurePresenceStyles(this.doc)
    this.attachListeners()
    this.attachHostDisconnectObserver()
    this.hostFocused = this.doc.activeElement === this.host
    this.publishLocalPresence(this.hostFocused ? this.readLocalSelection() : null)
    this.scheduleRender()
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true

    if (this.throttleTimer !== null) {
      clearTimeout(this.throttleTimer)
      this.throttleTimer = null
    }

    this.awareness.setLocalStateField(PRESENCE_STATE_KEY, null)
    this.detachListeners()
    this.disconnectObserver?.disconnect()
    this.disconnectObserver = null
    this.renderer.destroy?.(getOrCreatePresenceLayer(this.host))
    removePresenceLayer(this.host)
  }

  get isDestroyed(): boolean {
    return this.destroyed
  }

  /** Forces an immediate local awareness publish and overlay refresh. */
  refresh(): void {
    if (this.destroyed) return
    this.publishLocalPresence(this.hostFocused ? this.readLocalSelection() : null)
    this.renderRemotePresences()
  }

  /** Cleans up when the host node is removed without an explicit {@link destroy}. */
  private attachHostDisconnectObserver(): void {
    if (typeof MutationObserver === 'undefined') return
    const root = this.doc.documentElement
    if (!root) return

    this.disconnectObserver = new MutationObserver(() => {
      if (!this.destroyed && !this.host.isConnected) this.destroy()
    })
    this.disconnectObserver.observe(root, { childList: true, subtree: true })
  }

  private attachListeners(): void {
    this.awareness.on('change', this.onAwarenessChange)
    this.yText.observe(this.onYTextChange)
    this.host.addEventListener('focus', this.onHostFocus, true)
    this.host.addEventListener('blur', this.onHostBlur, true)
    this.win.addEventListener('selectionchange', this.onSelectionChange)
    this.win.addEventListener('scroll', this.onScrollOrResize, true)
    this.win.addEventListener('resize', this.onScrollOrResize)
  }

  private detachListeners(): void {
    this.awareness.off('change', this.onAwarenessChange)
    this.yText.unobserve(this.onYTextChange)
    this.host.removeEventListener('focus', this.onHostFocus, true)
    this.host.removeEventListener('blur', this.onHostBlur, true)
    this.win.removeEventListener('selectionchange', this.onSelectionChange)
    this.win.removeEventListener('scroll', this.onScrollOrResize, true)
    this.win.removeEventListener('resize', this.onScrollOrResize)
  }

  private schedulePublish(): void {
    if (this.destroyed || !this.hostFocused) return
    this.pendingPublish = true
    if (this.throttleTimer !== null) return

    this.throttleTimer = setTimeout(() => {
      this.throttleTimer = null
      if (!this.pendingPublish) return
      this.pendingPublish = false
      this.publishLocalPresence(this.readLocalSelection())
    }, this.throttleMs)
  }

  private scheduleRender(): void {
    if (this.destroyed) return
    requestAnimationFrame(() => {
      if (!this.destroyed) this.renderRemotePresences()
    })
  }

  private readLocalSelection(): { anchor: number; head: number } | null {
    const snapshot = captureSelectionSnapshot(
      this.host,
      this.editable.dispatcher.selectionWatcher.getFreshSelection()
    )
    if (!snapshot) return null
    return { anchor: snapshot.anchor, head: snapshot.head }
  }

  private publishLocalPresence(selection: { anchor: number; head: number } | null): void {
    if (this.destroyed) return

    const doc = this.yText.doc
    if (!doc) return

    const textLength = getOperationTextLength(this.host)
    const payload: PresencePayloadV1 = selection
      ? buildPresencePayload({
          ...offsetsToRelativePositionJson(
            this.yText,
            selection.anchor,
            selection.head,
            textLength
          ),
          name: this.user.name,
          color: this.user.color,
          focused: true
        })
      : buildPresencePayload({
          anchor: null,
          head: null,
          name: this.user.name,
          color: this.user.color,
          focused: false
        })

    this.awareness.setLocalStateField(PRESENCE_STATE_KEY, payload)
  }

  private renderRemotePresences(): void {
    if (this.destroyed || !this.renderCursors) return
    if (!this.host.isConnected) return

    const doc = this.yText.doc
    if (!doc) return

    const layer = getOrCreatePresenceLayer(this.host)
    const views: RemotePresenceView[] = []

    for (const [clientId, state] of this.awareness.getStates()) {
      if (clientId === this.awareness.clientID) continue
      if (!state) continue

      const payload = parsePresencePayload(state[PRESENCE_STATE_KEY])
      if (!payload || !payload.focused) continue

      const resolved = resolvePresenceSelection(doc, this.yText, payload.anchor, payload.head)
      if (!resolved) continue

      views.push({
        clientId,
        anchor: resolved.anchor,
        head: resolved.head,
        name: payload.name,
        color: payload.color,
        focused: payload.focused
      })
    }

    this.renderer.render({
      host: this.host,
      layer,
      presences: views,
      reducedMotion: this.reducedMotion
    })
  }
}

function validatePresenceOptions(options: EditableYjsPresenceOptions): void {
  const { editable, host, yText, awareness, user } = options
  if (!editable?.ownsBlock(host)) {
    throw new Error('EditableYjsPresence: host is not registered with the Editable instance')
  }
  if (!host.isConnected) {
    throw new Error('EditableYjsPresence: host is not connected to the document')
  }
  if (!(yText instanceof Y.Text)) {
    throw new Error('EditableYjsPresence: yText must be a Y.Text instance')
  }
  if (!yText.doc) {
    throw new Error('EditableYjsPresence: yText must belong to a Y.Doc')
  }
  if (!awareness) {
    throw new Error('EditableYjsPresence: awareness instance is required')
  }
  if (awareness.doc !== yText.doc) {
    throw new Error('EditableYjsPresence: awareness.doc must match yText.doc')
  }
  if (!user?.name || !user?.color) {
    throw new Error('EditableYjsPresence: user.name and user.color are required')
  }
}
