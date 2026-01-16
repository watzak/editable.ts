import {textNode} from './node-type.js'

// A DOM node iterator.
//
// Has the ability to replace nodes on the fly and continue
// the iteration.
export default class NodeIterator {
  public current: Node | undefined
  public previous: Node | undefined
  public nextNode: Node | undefined
  public root: Node
  private iteratorFunc: () => Node | undefined

  constructor(root: Node, method?: string) {
    this.current = this.previous = this.nextNode = this.root = root
    this.iteratorFunc = (this as any)[method || 'getNext']
  }

  [Symbol.iterator](): this {
    return this
  }

  getNextTextNode(): Text | undefined {
    let next: Node | undefined
    while ((next = this.getNext())) {
      if (next.nodeType === textNode && (next as Text).data !== '') return next as Text
    }
    return undefined
  }

  getPreviousTextNode(): Text | undefined {
    let prev: Node | undefined
    while ((prev = this.getPrevious())) {
      if (prev.nodeType === textNode && (prev as Text).data !== '') return prev as Text
    }
    return undefined
  }

  next(): IteratorResult<Node | undefined, any> {
    const value = this.iteratorFunc()
    return value ? {value} : {done: true, value: undefined}
  }

  getNext(): Node | undefined {
    let n = this.current = this.nextNode
    let child: Node | null
    this.nextNode = undefined
    if (this.current) {
      child = (n as Element).firstChild

      // Skip the children of elements with the attribute data-editable="remove"
      // This prevents text nodes that are not part of the content to be included.
      if (child && (n as Element).getAttribute?.('data-editable') !== 'remove') {
        this.nextNode = child
      } else {
        while ((n !== this.root) && n) {
          const nextSibling = n.nextSibling
          if (nextSibling) {
            this.nextNode = nextSibling
            break
          }
          n = n.parentNode as Node
        }
      }
    }
    return this.current
  }

  getPrevious(): Node | undefined {
    let n = this.current = this.previous
    let child: Node | null
    this.previous = undefined
    if (this.current) {
      child = (n as Element).lastChild

      // Skip the children of elements with the attribute data-editable="remove"
      // This prevents text nodes that are not part of the content to be included.
      if (child && (n as Element).getAttribute?.('data-editable') !== 'remove') {
        this.previous = child
      } else {
        while ((n !== this.root) && n) {
          const prevSibling = n.previousSibling
          if (prevSibling) {
            this.previous = prevSibling
            break
          }
          n = n.parentNode as Node
        }
      }
    }
    return this.current
  }

  replaceCurrent(replacement: Node): void {
    this.current = replacement
    this.nextNode = undefined
    this.previous = undefined
    let n = this.current
    while ((n !== this.root) && n) {
      const nextSibling = n.nextSibling
      if (nextSibling) {
        this.nextNode = nextSibling
        break
      }
      n = n.parentNode as Node
    }
  }
}

