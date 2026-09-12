const assert = require('node:assert/strict')
const test = require('node:test')
const { JSDOM } = require('jsdom')

const {
  SETTINGS_KEY,
  DEFAULT_SETTINGS,
  BOOLEAN_KEYS,
  normalizeSettings,
  parseCustomSelectors,
  rootAttributeFor
} = require('./core.js')

test('all settings default off and malformed values are discarded', () => {
  assert.equal(SETTINGS_KEY, 'qHiderSettingsV1')
  assert.equal(BOOLEAN_KEYS.length, 8)
  assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS)
  assert.notEqual(normalizeSettings(null), DEFAULT_SETTINGS)
  assert.deepEqual(normalizeSettings({
    hideStamps: true,
    hideViewers: 1,
    hideBotMessages: false,
    customSelectors: ['.bad'],
    unknown: true
  }), {
    ...DEFAULT_SETTINGS,
    hideStamps: true
  })
  assert.deepEqual(Object.keys(normalizeSettings({})).sort(), Object.keys(DEFAULT_SETTINGS).sort())
})

test('root attributes use explicit stable mappings', () => {
  assert.equal(rootAttributeFor('hideStamps'), 'data-q-hider-hide-stamps')
  assert.equal(rootAttributeFor('hideBotMessages'), 'data-q-hider-hide-bot-messages')
  assert.equal(rootAttributeFor('disableAnimations'), 'data-q-hider-disable-animations')
  assert.equal(rootAttributeFor('unknown'), null)
})

test('custom selectors are trimmed, deduplicated, and validated per source line', () => {
  const { document } = new JSDOM().window
  assert.deepEqual(parseCustomSelectors(' .ad\n\n[data-x]\n.ad ', document), {
    ok: true,
    selectors: ['.ad', '[data-x]']
  })
  assert.deepEqual(parseCustomSelectors('.ok\ndiv[', document), {
    ok: false,
    line: 2,
    selector: 'div['
  })
  assert.deepEqual(parseCustomSelectors('', document), { ok: true, selectors: [] })
})
