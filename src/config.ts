export interface MarkupConfig {
  type: 'tag'
  name: string
  attribs: Record<string, any>
  trim: boolean
}

export interface PastedHtmlRules {
  allowedElements: Record<string, Record<string, boolean>>
  allowedPlainTextElements: Record<string, Record<string, boolean>>
  requiredAttributes: Record<string, string[]>
  transformElements: Record<string, string>
  splitIntoBlocks: string[]
  blockLevelElements: string[]
  blacklistedElements: string[]
  keepInternalRelativeLinks: boolean
  replaceQuotes: {
    quotes?: string[]
    singleQuotes?: string[]
    apostrophe?: string
  }
}

export interface Config {
  log: boolean
  logErrors: boolean
  editableClass: string
  editableDisabledClass: string
  pastingAttribute: string
  trimLeadingAndTrailingWhitespaces: boolean
  boldMarkup: MarkupConfig
  italicMarkup: MarkupConfig
  underlineMarkup: MarkupConfig
  linkMarkup: MarkupConfig
  pastedHtmlRules: PastedHtmlRules
}

const config: Config = {
  log: false,
  logErrors: true,
  editableClass: 'js-editable',
  editableDisabledClass: 'js-editable-disabled',
  pastingAttribute: 'data-editable-is-pasting',
  trimLeadingAndTrailingWhitespaces: true,
  boldMarkup: {
    type: 'tag',
    name: 'strong',
    attribs: {},
    trim: true
  },
  italicMarkup: {
    type: 'tag',
    name: 'em',
    attribs: {},
    trim: true
  },
  underlineMarkup: {
    type: 'tag',
    name: 'u',
    attribs: {},
    trim: false
  },
  linkMarkup: {
    type: 'tag',
    name: 'a',
    attribs: {},
    trim: true
  },
  pastedHtmlRules: {
    allowedElements: {
      'a': {
        'href': true,
        'rel': true,
        'target': true
      },
      'strong': {},
      'em': {},
      'br': {}
    },
    allowedPlainTextElements: {
      'br': {}
    },
    requiredAttributes: {
      'a': ['href']
    },
    transformElements: {
      'b': 'strong',
      'i': 'em'
    },
    splitIntoBlocks: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'blockquote'],
    blockLevelElements: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'p', 'pre', 'hr', 'blockquote',
      'article', 'figure', 'header', 'footer', 'ul', 'ol', 'li', 'section', 'table', 'video'
    ],
    blacklistedElements: ['style', 'script'],
    keepInternalRelativeLinks: false,
    replaceQuotes: {}
  }
}

export default config

