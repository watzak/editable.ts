/**
 * Deep merge objects, creating a new object with merged properties.
 * Arrays are replaced (not merged).
 */
type PlainObject = Record<string, unknown>

function isPlainObject(value: unknown): value is PlainObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function deepMerge<T extends object>(target: T, ...sources: Array<Partial<T> | undefined>): T {
  const result = {...target} as T
  
  for (const source of sources) {
    if (!isPlainObject(source)) continue
    
    for (const key of Object.keys(source) as Array<keyof T>) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) continue
      
      const sourceValue = source[key]
      const targetValue = result[key]
      
      // Deep merge if both are plain objects
      if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
        result[key] = deepMerge<PlainObject>(
          targetValue,
          sourceValue
        ) as T[keyof T]
      } else {
        result[key] = sourceValue as T[keyof T]
      }
    }
  }
  
  return result as T
}
