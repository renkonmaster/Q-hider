const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { JSDOM } = require('jsdom')

const Core = require('./core.js')
require('./app.js')
const { createOptionsController } = require('./options.js')

const markup = readFileSync(path.join(__dirname, 'options.html'), 'utf8')
const flush = () => new Promise(resolve => setTimeout(resolve, 0))

function setup(initial = Core.DEFAULT_SETTINGS, failures = {}) {
  const dom = new JSDOM(markup, { url: 'https://extension.invalid/options.html' })
  const saves = []
  const storage = {
    async load() {
      if (failures.load) throw new Error('load failed')
      return Core.normalizeSettings(initial)
    },
    async save(value) {
      if (failures.save) throw new Error('save failed')
      const normalized = Core.normalizeSettings(value)
      saves.push(normalized)
      return normalized
    }
  }
  const controller = createOptionsController({ document: dom.window.document, storage })
  return { dom, controller, storage, saves }
}

test('renders and loads all eight independently labeled switches', async () => {
  const state = setup({ ...Core.DEFAULT_SETTINGS, hideStamps: true, hideTyping: true })
  await state.controller.start()
  const document = state.dom.window.document
  const switches = [...document.querySelectorAll('[data-q-hider-setting]')]
  assert.equal(switches.length, 8)
  assert.ok(switches.every(input => document.querySelector(`label[for="${input.id}"]`)))
  assert.equal(document.querySelector('#hideStamps').checked, true)
  assert.equal(document.querySelector('#hideTyping').checked, true)
})

test('validates each custom selector line before saving', async () => {
  const state = setup()
  await state.controller.start()
  const document = state.dom.window.document
  document.querySelector('#custom-selectors').value = '.ok\ndiv['
  document.querySelector('#settings-form').dispatchEvent(new state.dom.window.Event('submit', {
    bubbles: true,
    cancelable: true
  }))
  await flush()
  assert.equal(state.saves.length, 0)
  assert.equal(document.querySelector('#status').textContent, 'カスタムセレクターの2行目が不正です')

  document.querySelector('#custom-selectors').value = '.ok\n[data-ad]'
  document.querySelector('#hideAttachments').checked = true
  document.querySelector('#settings-form').dispatchEvent(new state.dom.window.Event('submit', {
    bubbles: true,
    cancelable: true
  }))
  await flush()
  assert.equal(state.saves.at(-1).hideAttachments, true)
  assert.equal(state.saves.at(-1).customSelectors, '.ok\n[data-ad]')
  assert.equal(document.querySelector('#status').textContent, '設定を保存しました')
})

test('bulk controls preserve custom text and do not save until submit', async () => {
  const state = setup({ ...Core.DEFAULT_SETTINGS, customSelectors: '.keep' })
  await state.controller.start()
  const document = state.dom.window.document
  document.querySelector('#hide-all').click()
  assert.ok([...document.querySelectorAll('[data-q-hider-setting]')].every(input => input.checked))
  assert.equal(document.querySelector('#custom-selectors').value, '.keep')
  document.querySelector('#show-all').click()
  assert.ok([...document.querySelectorAll('[data-q-hider-setting]')].every(input => !input.checked))
  assert.equal(document.querySelector('#custom-selectors').value, '.keep')
  assert.equal(state.saves.length, 0)
})

test('initialization is idempotent and storage errors are visible', async () => {
  const state = setup(Core.DEFAULT_SETTINGS, { save: true })
  assert.equal(createOptionsController({ document: state.dom.window.document, storage: state.storage }), state.controller)
  await state.controller.start()
  state.dom.window.document.querySelector('#settings-form').dispatchEvent(new state.dom.window.Event('submit', {
    bubbles: true,
    cancelable: true
  }))
  await flush()
  assert.equal(state.dom.window.document.querySelector('#status').dataset.error, 'true')
})
