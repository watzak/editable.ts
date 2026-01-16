const toString = Object.prototype.toString
const htmlCharacters: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}

// TODO: replace with lodash methods
export function trimRight(text: string): string {
  return text.replace(/\s+$/, '')
}

export function trimLeft(text: string): string {
  return text.replace(/^\s+/, '')
}

export function trim(text: string): string {
  return text.replace(/^\s+|\s+$/g, '')
}

export function isString(obj: any): obj is string {
  return toString.call(obj) === '[object String]'
}

/**
 * Turn any string into a regular expression.
 * This can be used to search or replace a string conveniently.
 */
export function regexp(str: string, flags?: string): RegExp {
  if (!flags) flags = 'g'
  const escapedStr = str.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')
  return new RegExp(escapedStr, flags)
}

/**
 * Escape HTML characters <, > and &
 * Usage: escapeHtml('<div>')
 *
 * @param { String }
 * @param { Boolean } Optional. If true " and ' will also be escaped.
 * @return { String } Escaped Html you can assign to innerHTML of an element.
 */

// TODO: replace with npm.im/he
export function escapeHtml(s: string, forAttribute?: boolean): string {
  return s.replace(forAttribute ? /[&<>'"]/g : /[&<>]/g, function (c: string) {
    return htmlCharacters[c] || c
  })
}

/**
 * Escape a string the browser way.
 */
export function browserEscapeHtml(str: string): string {
  const div = document.createElement('div')
  div.appendChild(document.createTextNode(str))
  return div.innerHTML
}

export function replaceLast(text: string | null | undefined, searchValue: string | null | undefined, replaceValue: string | null | undefined): string {
  if (!text) return ''
  text = `${text}`
  if (!searchValue || replaceValue == null) return text
  const lastOccurrenceIndex = text.lastIndexOf(searchValue)
  if (lastOccurrenceIndex === -1) return text
  return `${
    text.slice(0, lastOccurrenceIndex)
  }${
    replaceValue
  }${
    text.slice(lastOccurrenceIndex + searchValue.length)
  }`
}

export function endsWithSingleSpace(text: string): boolean {
  return /\S+\s{1}$/.test(text)
}

