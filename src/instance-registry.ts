import type { Editable } from './core.js'

const blockOwners = new WeakMap<HTMLElement, Editable>()

/**
 * Assigns block ownership to an instance.
 * Returns the previous owner when ownership is transferred.
 */
export function claimBlock(block: HTMLElement, instance: Editable): Editable | undefined {
  const previousOwner = blockOwners.get(block)
  blockOwners.set(block, instance)
  return previousOwner
}

export function releaseBlock(block: HTMLElement, instance: Editable): void {
  if (blockOwners.get(block) === instance) {
    blockOwners.delete(block)
  }
}

export function getBlockOwner(block: HTMLElement): Editable | undefined {
  return blockOwners.get(block)
}

export function isBlockOwnedBy(block: HTMLElement, instance: Editable): boolean {
  return blockOwners.get(block) === instance
}
