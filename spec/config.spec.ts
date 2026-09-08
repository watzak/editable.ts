import { cloneDeep } from '../src/util/clone-deep.js'
import config from '../src/config.js'
import { Editable } from '../src/core.js'

describe('Editable configuration', function () {
  describe('instance configuration', function () {
    let editable: Editable | undefined

    afterEach(function () {
      if (!editable) return
      editable.unload()
      editable = undefined
    })

    it('has default values', function () {
      editable = new Editable()
      expect(editable.config.defaultBehavior).toBe(true)
    })

    it('does not include the global configuration', function () {
      editable = new Editable()
      expect(editable.globalSettings.editableClass).toBe('js-editable')
      expect('editableClass' in editable.config).toBe(false)
    })

    it('overrides the default values', function () {
      editable = new Editable({
        defaultBehavior: false
      })
      expect(editable.config.defaultBehavior).toBe(false)
    })
  })

  describe('globalConfig()', function () {
    const originalConfig = cloneDeep(config)

    beforeEach(function () {
      Editable.globalConfig(originalConfig)
    })

    afterEach(function () {
      Editable.globalConfig(originalConfig)
    })

    it('retreives the config', function () {
      expect(originalConfig).toEqual(Editable.getGlobalConfig())
    })

    it('returns a defensive copy from getGlobalConfig()', function () {
      const snapshot = Editable.getGlobalConfig()
      snapshot.editableClass = 'temporary-class'

      expect(Editable.getGlobalConfig().editableClass).toBe('js-editable')
      expect(snapshot).not.toBe(config)
    })

    it('deep-merges nested pastedHtmlRules via globalConfig()', function () {
      Editable.globalConfig({
        pastedHtmlRules: {
          allowedElements: {
            span: { class: true }
          }
        }
      } as unknown as Partial<import('../src/config.js').Config>)

      expect(Editable.getGlobalConfig().pastedHtmlRules.allowedElements.a).toEqual({
        href: true,
        rel: true,
        target: true
      })
      expect(Editable.getGlobalConfig().pastedHtmlRules.allowedElements.span).toEqual({
        class: true
      })
    })

    it('retrieves the current state of the config', function () {
      Editable.globalConfig({ editableClass: 'editable-instance' })
      expect(originalConfig).not.toBe(Editable.getGlobalConfig())
    })

    it('has a default value for "editableClass"', function () {
      expect(Editable.getGlobalConfig().editableClass).toBe('js-editable')
    })

    it('overrides "editableClass"', function () {
      Editable.globalConfig({ editableClass: 'editable-instance' })
      expect(Editable.getGlobalConfig().editableClass).toBe('editable-instance')
    })

    // Safety check for the test setup
    it('resets the default after each spec', function () {
      expect(Editable.getGlobalConfig().editableClass).toBe('js-editable')
    })
  })
})
