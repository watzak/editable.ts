import config from '../config.js'

// Allows for safe error logging
// Falls back to console.log if console.error is not available
export default function error(...args: any[]): void {
  if (config.logErrors === false) return

  const errorArgs = args.length === 1 ? args[0] : args

  if (!global.console) return

  if (typeof console.error === 'function') {
    console.error(errorArgs)
    return
  }

  console.log(errorArgs)
}

