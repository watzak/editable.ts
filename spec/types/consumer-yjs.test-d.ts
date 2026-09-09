/**
 * Consumer-facing type checks for the yjs package entry.
 */
import { Editable } from 'editable.ts'
import {
  EditableYjsBinding,
  InitialSyncConflictError,
  classifyInitialSync,
  type InitialSyncConflictResolver,
  type InitialSyncPolicy
} from 'editable.ts/yjs'
import type * as Y from 'yjs'

declare const block: HTMLElement
declare const yText: Y.Text

const editable = new Editable({ defaultBehavior: false })
editable.add(block)

const policy: InitialSyncPolicy = {
  yEmptyHostFilled: 'copy-host-to-y',
  hostEmptyYFilled: 'copy-y-to-host',
  bothFilledDiffer: 'error'
}

const resolver: InitialSyncConflictResolver = {
  resolve: (ctx) => (ctx.hostText.length > ctx.yText.length ? 'host' : 'y')
}

const resolverPolicy: InitialSyncPolicy = {
  yEmptyHostFilled: 'copy-host-to-y',
  hostEmptyYFilled: 'copy-y-to-host',
  bothFilledDiffer: resolver
}

const binding = new EditableYjsBinding({
  editable,
  host: block,
  yText,
  initialSync: policy
})

binding.destroy()

const scenario = classifyInitialSync('a', 'b')
const conflict = new InitialSyncConflictError('a', 'b')

export type ConsumerYjsCheck = [
  typeof binding,
  typeof scenario,
  typeof conflict,
  typeof resolverPolicy
]
