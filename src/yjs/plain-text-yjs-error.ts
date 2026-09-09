export class PlainTextYjsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PlainTextYjsError'
  }
}
