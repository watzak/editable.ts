export function stripAsciiControlCharacters(value: string): string {
  let sanitized = ''
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code > 0x1f && code !== 0x7f) sanitized += value[index]
  }
  return sanitized
}
