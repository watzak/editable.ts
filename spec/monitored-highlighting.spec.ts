

import {Editable} from '../src/core.js'
import MonitoredHighlighting from '../src/monitored-highlighting.js'

describe('MonitoredHighlighting:', function () {
  let editable

  beforeEach(function () {
    editable = new Editable()
  })

  afterEach(function () {
    editable?.unload()
  })

  it('creates an instance with a reference to editable', function () {
    const highlighting = new MonitoredHighlighting(editable, {})
    expect(highlighting.editable).toBe(editable)
  })
})
