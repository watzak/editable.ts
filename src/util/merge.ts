/**
 * Deep merge objects, creating a new object with merged properties.
 * Arrays are replaced (not merged).
 */
export function deepMerge<T extends Record<string, any>>(target: T, ...sources: Partial<T>[]): T {
  const result = {...target} as any
  
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue
    
    for (const key in source) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) continue
      
      const sourceValue = source[key]
      const targetValue = result[key]
      
      // Deep merge if both are plain objects
      if (
        sourceValue &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        targetValue &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue)
      ) {
        result[key] = deepMerge({}, targetValue, sourceValue)
      } else {
        result[key] = sourceValue
      }
    }
  }
  
  return result as T
}

