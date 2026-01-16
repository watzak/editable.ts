/**
 * Deep clone an object using JSON serialization.
 * Suitable for plain objects, arrays, and primitives.
 * Note: Does not handle functions, Date objects, RegExp, etc.
 * For test use cases with plain configuration objects, this is sufficient.
 */
export function cloneDeep<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

