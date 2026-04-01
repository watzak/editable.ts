import config from '../config.js'

// Allows for safe console logging
// If the last param is the string "trace" console.trace will be called
// configuration: disable with config.log = false
export default function log(...args: unknown[]): void {
  if (config.log === false) return

  if (!globalThis.console) return

  const logArgs = args.length === 1 ? args[0] : [...args]

  if (Array.isArray(logArgs) && logArgs[logArgs.length - 1] === 'trace') {
    logArgs.pop()
    if (console.trace) console.trace()
  }

  console.log(logArgs)
}
