import type { Config, PastedHtmlRules } from './config.js'

export interface PasteRules {
  allowedElements: Record<string, Record<string, boolean>>
  allowedPlainTextElements: Record<string, Record<string, boolean>>
  requiredAttributes: Record<string, string[]>
  transformElements: Record<string, string>
  blockLevelElements: Record<string, boolean>
  splitIntoBlocks: Record<string, boolean>
  blacklistedElements: string[]
  keepInternalRelativeLinks: boolean
  replaceQuotes: PastedHtmlRules['replaceQuotes']
  pastingAttribute: string
}

export function compilePasteRules(conf: Config): PasteRules {
  const rules = conf.pastedHtmlRules
  const blockLevelElements: Record<string, boolean> = {}
  rules.blockLevelElements.forEach((name: string) => {
    blockLevelElements[name] = true
  })
  const splitIntoBlocks: Record<string, boolean> = {}
  rules.splitIntoBlocks.forEach((name: string) => {
    splitIntoBlocks[name] = true
  })

  return {
    allowedElements: rules.allowedElements || {},
    allowedPlainTextElements: rules.allowedPlainTextElements || {},
    requiredAttributes: rules.requiredAttributes || {},
    transformElements: rules.transformElements || {},
    blacklistedElements: rules.blacklistedElements || [],
    keepInternalRelativeLinks: rules.keepInternalRelativeLinks || false,
    replaceQuotes: rules.replaceQuotes || {},
    blockLevelElements,
    splitIntoBlocks,
    pastingAttribute: conf.pastingAttribute
  }
}
