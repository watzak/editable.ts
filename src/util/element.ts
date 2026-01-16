import NodeIterator from '../node-iterator.js'

export function textNodesUnder(node: Node): Text[] {
  const iterator = new NodeIterator(node, 'getNextTextNode')
  return [...iterator] as Text[]
}

// NOTE: if there is only one text node, then just that node and
// the abs offset are returned
export function getTextNodeAndRelativeOffset({textNodes, absOffset}: {
  textNodes: Text[]
  absOffset: number
}): {node: Text | undefined, relativeOffset: number} {
  let cumulativeOffset = 0
  let relativeOffset = 0
  let targetNode: Text | undefined
  for (let i = 0; i < textNodes.length; i++) {
    const node = textNodes[i]
    const nodeLength = node.textContent?.length || 0
    if (absOffset <= cumulativeOffset + nodeLength) {
      targetNode = node
      relativeOffset = absOffset - cumulativeOffset
      break
    }
    cumulativeOffset += nodeLength
  }
  return {node: targetNode, relativeOffset}
}

export function getTotalCharCount(element: Node): number {
  const textNodes = textNodesUnder(element)
  const reducer = (acc: number, node: Text) => acc + (node.textContent?.length || 0)
  return textNodes.reduce(reducer, 0)
}

