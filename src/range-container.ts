import Cursor from './cursor.js'
import Selection from './selection.js'
import {rangesAreEqual} from './util/dom.js'

/** RangeContainer
 *
 * primarily used to compare ranges
 * its designed to work with undefined ranges as well
 * so we can easily compare them without checking for undefined
 * all the time
 */

export default class RangeContainer {
  public host: HTMLElement | undefined
  public range: Range | undefined
  public isAnythingSelected: boolean
  public isCursor: boolean
  public isSelection: boolean

  constructor (editableHost?: HTMLElement | any, range?: Range) {
    this.host = editableHost && (editableHost as any).jquery
      ? (editableHost as any)[0]
      : editableHost
    // Safari 17 seems to modify the range instance on the fly which breaks later comparisons.
    // We clone the range at the time of the RangeContainer creation.
    // https://developer.apple.com/documentation/safari-release-notes/safari-17-release-notes#New-Features
    this.range = range?.cloneRange()
    this.isAnythingSelected = (range !== undefined)
    this.isCursor = (this.isAnythingSelected && range!.collapsed)
    this.isSelection = (this.isAnythingSelected && !this.isCursor)
  }

  getCursor (): Cursor | undefined {
    if (this.isCursor && this.host && this.range) return new Cursor(this.host, this.range)
    return undefined
  }

  getSelection (): Selection | undefined {
    if (this.isSelection && this.host && this.range) return new Selection(this.host, this.range)
    return undefined
  }

  forceCursor (): Cursor | undefined {
    if (!this.isSelection) return this.getCursor()
    const selection = this.getSelection()
    if (selection) return selection.deleteContent()
    return undefined
  }

  isDifferentFrom (otherRangeContainer: RangeContainer = new RangeContainer()): boolean {
    const self = this.range
    const other = otherRangeContainer.range
    if (self && other) return !rangesAreEqual(self, other)
    if (!self && other) return false
    return true
  }
}
