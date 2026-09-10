import { stripAsciiControlCharacters } from '../../src/yjs/sanitize.js'

describe('stripAsciiControlCharacters', function () {
  it('removes ASCII control characters and DEL', function () {
    expect(stripAsciiControlCharacters('hello\u0000world\u007f')).toBe('helloworld')
    expect(stripAsciiControlCharacters('\u001fstart')).toBe('start')
  })

  it('preserves printable text and non-ASCII characters', function () {
    expect(stripAsciiControlCharacters('Ada Lovelace')).toBe('Ada Lovelace')
    expect(stripAsciiControlCharacters('café 🎉')).toBe('café 🎉')
  })

  it('feeds presence and annotation sanitizers without regex control-char lint', function () {
    const raw = 'Ada\u0000<script>\u007f'
    expect(stripAsciiControlCharacters(raw)).toBe('Ada<script>')
    expect(
      stripAsciiControlCharacters(raw)
        .replace(/[<>"'`]/g, '')
        .trim()
    ).toBe('Adascript')
  })
})
