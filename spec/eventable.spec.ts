
import eventable from '../src/eventable.js'

describe('eventable', function () {

  describe('with individual contexts', function () {
    let obj: any

    beforeEach(function () {
      obj = {}
      eventable(obj)
    })

    it('passes the arguments right', function () {
      let called = 0
      obj.on('publish', function (argA: string, argB: string) {
        called++
        expect(argA).toBe('A')
        expect(argB).toBe('B')
      })

      obj.notify(undefined, 'publish', 'A', 'B')
      expect(called).toBe(1)
    })

    it('sets the proper context', function () {
      let called = 0
      obj.on('publish', function (arg: any) {
        called++
        expect(this.test).toBe('A')
      })
      obj.notify({test: 'A'}, 'publish')
      expect(called).toBe(1)
    })
  })

  describe('with a predefined context', function () {
    let obj: any

    beforeEach(function () {
      obj = {}
      eventable(obj, {test: 'context'})
    })

    it('attaches an "on" method', function () {
      expect(obj.on).not.toBe(undefined)
    })

    it('attaches an "off" method', function () {
      expect(obj.off).not.toBe(undefined)
    })

    it('attaches a "notify" method', function () {
      expect(obj.notify).not.toBe(undefined)
    })

    it('passes the arguments right', function () {
      let called = 0
      obj.on('publish', (argA: string, argB: string) => {
        called++
        expect(argA).toBe('A')
        expect(argB).toBe('B')
      })
      obj.notify('publish', 'A', 'B')
      expect(called).toBe(1)
    })

    it('sets the context', function () {
      let called = 0
      obj.on('publish', function () {
        called++
        expect(this.test).toBe('context')
      })
      obj.notify('publish')
      expect(called).toBe(1)
    })

    describe('on()', function () {

      it('notifies a listener', function () {
        let called = 0
        obj.on('publish', () => {
          called++
        })

        obj.notify('publish', 'success')
        expect(called).toBe(1)
      })

      it('accepts multiple whitespace separated event names', function () {
        let called = 0
        obj.on('publish unpublish', () => {
          called++
        })

        obj.notify('publish')
        obj.notify('unpublish')
        obj.notify('foo') // should do nothing
        expect(called).toBe(2)
      })

      it('accepts an object to register multiple events', function () {
        let published = 0
        let unpublished = 0

        obj.on({
          publish: () => { published++ },
          unpublish: () => { unpublished++ }
        })

        obj.notify('publish')
        obj.notify('unpublish')
        expect(published).toBe(1)
        expect(unpublished).toBe(1)
      })

      it('accepts multiple event names in object form', function () {
        let called = 0

        obj.on({
          'publish unpublish': () => { called++ }
        })

        obj.notify('publish')
        obj.notify('unpublish')
        expect(called).toBe(2)
      })
    })

    describe('off()', function () {
      let calledA: number, calledB: number, calledC: number
      function listenerA () {
        calledA++
      }

      beforeEach(function () {
        calledA = calledB = calledC = 0
        obj.on('publish', listenerA)
        obj.on('publish', () => calledB++)
        obj.on('awesome', () => calledC++)
      })

      it('can cope with undefined', function () {
        obj.off('publish', undefined)
        obj.notify('publish', 'success')
        expect(calledA).toBe(1)
        expect(calledB).toBe(1)
        expect(calledC).toBe(0)
      })

      it('removes a single listener', function () {
        obj.off('publish', listenerA)
        obj.notify('publish', 'success')
        expect(calledA).toBe(0)
        expect(calledB).toBe(1)
        expect(calledC).toBe(0)
      })

      it('removes all listeners for one event type', function () {
        obj.off('publish')
        obj.notify('publish', 'success')
        obj.notify('awesome', 'success')
        expect(calledA).toBe(0)
        expect(calledB).toBe(0)
        expect(calledC).toBe(1)
      })

      it('removes all listeners', function () {
        obj.off()
        obj.notify('publish', 'success')
        obj.notify('awesome', 'success')
        expect(calledA).toBe(0)
        expect(calledB).toBe(0)
        expect(calledC).toBe(0)
      })
    })
  })

  describe('notify()', function () {
    let results, obj

    beforeEach(function () {
      results = []
      obj = {}
      eventable(obj)

      obj.on('foo', () => results.push(2))

      obj.on('foo', () => results.push(1))
    })

    it('executes newest listeners first', function () {
      obj.notify({}, 'foo')

      expect(results).toEqual([1, 2])
    })

    it('executes newest listeners first on repeated calls', function () {
      obj.notify({}, 'foo')
      obj.notify({}, 'foo')

      expect(results).toEqual([1, 2, 1, 2])
    })
  })
})
