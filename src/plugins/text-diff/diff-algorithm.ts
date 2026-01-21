export interface DiffOperation {
  type: 'equal' | 'delete' | 'insert'
  value: string
  oldStart: number
  oldEnd: number
  newStart: number
  newEnd: number
}

/**
 * Compute character-level diff between two strings
 * Returns an array of operations (equal, delete, insert)
 */
export function computeDiff(oldText: string, newText: string): DiffOperation[] {
  if (oldText === newText) {
    return [{
      type: 'equal',
      value: oldText,
      oldStart: 0,
      oldEnd: oldText.length,
      newStart: 0,
      newEnd: newText.length
    }]
  }

  if (oldText === '') {
    return [{
      type: 'insert',
      value: newText,
      oldStart: 0,
      oldEnd: 0,
      newStart: 0,
      newEnd: newText.length
    }]
  }

  if (newText === '') {
    return [{
      type: 'delete',
      value: oldText,
      oldStart: 0,
      oldEnd: oldText.length,
      newStart: 0,
      newEnd: 0
    }]
  }

  // Use longest common subsequence (LCS) approach
  const operations: DiffOperation[] = []
  const lcs = computeLCS(oldText, newText)

  let oldIndex = 0
  let newIndex = 0
  let lcsIndex = 0

  while (oldIndex < oldText.length || newIndex < newText.length) {
    // Find the next common character
    if (lcsIndex < lcs.length &&
        oldIndex < oldText.length &&
        newIndex < newText.length &&
        oldText[oldIndex] === lcs[lcsIndex] &&
        newText[newIndex] === lcs[lcsIndex]) {
      // Common character found
      const startOld = oldIndex
      const startNew = newIndex
      let commonLength = 0

      while (lcsIndex < lcs.length &&
             oldIndex < oldText.length &&
             newIndex < newText.length &&
             oldText[oldIndex] === lcs[lcsIndex] &&
             newText[newIndex] === lcs[lcsIndex]) {
        commonLength++
        oldIndex++
        newIndex++
        lcsIndex++
      }

      operations.push({
        type: 'equal',
        value: oldText.substring(startOld, (startOld + commonLength)),
        oldStart: startOld,
        oldEnd: (startOld + commonLength),
        newStart: startNew,
        newEnd: (startNew + commonLength)
      })
    } else {
      // Handle deletions and insertions
      const deleteStart = oldIndex
      const insertStart = newIndex

      // Collect deletions (characters in oldText not in LCS)
      while (oldIndex < oldText.length &&
             ((lcsIndex >= lcs.length) || (oldText[oldIndex] !== lcs[lcsIndex]))) {
        oldIndex++
      }

      // Collect insertions (characters in newText not in LCS)
      while (newIndex < newText.length &&
             ((lcsIndex >= lcs.length) || (newText[newIndex] !== lcs[lcsIndex]))) {
        newIndex++
      }

      if (oldIndex > deleteStart) {
        operations.push({
          type: 'delete',
          value: oldText.substring(deleteStart, oldIndex),
          oldStart: deleteStart,
          oldEnd: oldIndex,
          newStart: insertStart,
          newEnd: insertStart
        })
      }

      if (newIndex > insertStart) {
        operations.push({
          type: 'insert',
          value: newText.substring(insertStart, newIndex),
          oldStart: deleteStart,
          oldEnd: deleteStart,
          newStart: insertStart,
          newEnd: newIndex
        })
      }
    }
  }

  return operations
}

/**
 * Compute Longest Common Subsequence (LCS) between two strings
 * Returns the LCS as a string
 */
function computeLCS(str1: string, str2: string): string {
  const m = str1.length
  const n = str2.length
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0))

  // Build DP table
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // Reconstruct LCS
  let lcs = ''
  let i = m
  let j = n

  while (i > 0 && j > 0) {
    if (str1[i - 1] === str2[j - 1]) {
      lcs = str1[i - 1] + lcs
      i--
      j--
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--
    } else {
      j--
    }
  }

  return lcs
}
