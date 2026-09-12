const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const test = require('node:test')
const { JSDOM } = require('jsdom')

const Core = require('./core.js')
const Detector = require('./detector.js')
const { createSettingsStorage, applyRootSettings, createQHiderApp } = require('./app.js')

const createChangeEvent = () => {
  const listeners = new Set()
  return {
    addListener: listener => listeners.add(listener),
    removeListener: listener => listeners.delete(listener),
    emit: (changes, area) => [...listeners].forEach(listener => listener(changes, area)),
    get size() { return listeners.size }
  }
}

function fakeChrome({ stored, rejectGet = false, rejectSet = false } = {}) {
  const changed = createChangeEvent()
  const values = stored === undefined ? {} : { [Core.SETTINGS_KEY]: stored }
  return {
    chromeApi: {
      storage: {
        sync: {
          async get(defaults) {
            if (rejectGet) throw new Error('get failed')
            return { [Core.SETTINGS_KEY]: values[Core.SETTINGS_KEY] ?? defaults[Core.SETTINGS_KEY] }
          },
          async set(update) {
            if (rejectSet) throw new Error('set failed')
            Object.assign(values, update)
          }
        },
        onChanged: changed
      }
    },
    changed,
    values
  }
}

test('root settings apply and all-off restoration removes every state attribute', () => {
  const dom = new JSDOM()
  const root = dom.window.document.documentElement
  applyRootSettings(root, { ...Core.DEFAULT_SETTINGS, hideStamps: true, hideBotMessages: true })
  assert.equal(root.getAttribute(Core.rootAttributeFor('hideStamps')), 'true')
  assert.equal(root.getAttribute(Core.rootAttributeFor('hideBotMessages')), 'true')
  assert.equal(root.hasAttribute(Core.rootAttributeFor('hideViewers')), false)

  applyRootSettings(root, Core.DEFAULT_SETTINGS)
  for (const key of Core.BOOLEAN_KEYS) assert.equal(root.hasAttribute(Core.rootAttributeFor(key)), false)
})

test('settings storage normalizes, saves, subscribes, and falls back safely', async () => {
  const fake = fakeChrome({ stored: { hideStamps: true, unknown: true } })
  const storage = createSettingsStorage(fake.chromeApi, { warn() {} })
  assert.equal((await storage.load()).hideStamps, true)
  const saved = await storage.save({ hideViewers: true })
  assert.equal(saved.hideViewers, true)
  assert.equal(saved.hideStamps, false)

  let update
  const unsubscribe = storage.subscribe(value => { update = value })
  fake.changed.emit({ [Core.SETTINGS_KEY]: { newValue: { hideBotMessages: true } } }, 'sync')
  assert.equal(update.hideBotMessages, true)
  fake.changed.emit({ other: { newValue: true } }, 'sync')
  assert.equal(update.hideBotMessages, true)
  unsubscribe()
  assert.equal(fake.changed.size, 0)

  const warnings = []
  const failed = fakeChrome({ rejectGet: true, rejectSet: true })
  const fallback = createSettingsStorage(failed.chromeApi, { warn: message => warnings.push(message) })
  assert.deepEqual(await fallback.load(), Core.DEFAULT_SETTINGS)
  assert.equal((await fallback.save({ hideTyping: true })).hideTyping, true)
  await fallback.load()
  assert.ok(warnings.every(message => message.startsWith('Q-Hider:')))
  assert.equal(new Set(warnings).size, warnings.length)
})

test('stylesheet gates all markers and avoids exact generated hashes', () => {
  const css = readFileSync(new URL('./content.css', `file://${__filename}`), 'utf8')
  for (const key of Core.BOOLEAN_KEYS) {
    assert.match(css, new RegExp(Core.rootAttributeFor(key)))
  }
  for (const marker of Object.values(Detector.MARKERS)) assert.match(css, new RegExp(marker))
  assert.match(css, /display:\s*none\s*!important/u)
  assert.match(css, /::before/u)
  assert.match(css, /::after/u)
  assert.doesNotMatch(css, /\._[A-Za-z][\w-]*_[A-Za-z0-9]{6,}/u)
})

class FakeObserver {
  static instances = []
  constructor(callback) { this.callback = callback; this.disconnected = false; FakeObserver.instances.push(this) }
  observe(target, options) { this.observed = { target, options } }
  disconnect() { this.disconnected = true }
}

function scheduler() {
  const jobs = new Map()
  let id = 0
  return {
    setTimeout(callback) { id += 1; jobs.set(id, callback); return id },
    clearTimeout(jobId) { jobs.delete(jobId) },
    flush() { const values = [...jobs.values()]; jobs.clear(); values.forEach(callback => callback()) },
    get size() { return jobs.size }
  }
}

test('app batches bounded scans, applies live settings, and stops cleanly', async () => {
  FakeObserver.instances = []
  const dom = new JSDOM('<article class="_body_hash"><div id="target"></div></article>')
  const settingsListeners = new Set()
  const storage = {
    async load() { return { ...Core.DEFAULT_SETTINGS, hideStamps: true } },
    subscribe(listener) { settingsListeners.add(listener); return () => settingsListeners.delete(listener) }
  }
  const scans = []
  const detector = { scan(root, selectors) { scans.push({ root, selectors }); return { invalidSelectors: [] } } }
  const queue = scheduler()
  const app = createQHiderApp({
    document: dom.window.document,
    storage,
    detector,
    MutationObserver: FakeObserver,
    setTimeout: callback => queue.setTimeout(callback),
    clearTimeout: id => queue.clearTimeout(id),
    logger: { warn() {}, error() {} }
  })

  await app.start()
  await app.start()
  assert.equal(scans.length, 1)
  assert.equal(settingsListeners.size, 1)
  assert.equal(FakeObserver.instances.length, 1)
  assert.equal(dom.window.document.documentElement.hasAttribute(Core.rootAttributeFor('hideStamps')), true)

  const added = dom.window.document.createElement('span')
  dom.window.document.querySelector('#target').append(added)
  for (let index = 0; index < 5; index += 1) {
    FakeObserver.instances[0].callback([{ addedNodes: [added], target: added.parentElement }])
  }
  assert.equal(queue.size, 1)
  queue.flush()
  assert.equal(scans.length, 2)
  assert.notEqual(scans[1].root, dom.window.document)

  settingsListeners.forEach(listener => listener({ ...Core.DEFAULT_SETTINGS, hideBotMessages: true, customSelectors: '.ad' }))
  assert.equal(dom.window.document.documentElement.hasAttribute(Core.rootAttributeFor('hideStamps')), false)
  assert.equal(dom.window.document.documentElement.hasAttribute(Core.rootAttributeFor('hideBotMessages')), true)
  assert.equal(scans.at(-1).root, dom.window.document)

  app.stop()
  assert.equal(FakeObserver.instances[0].disconnected, true)
  assert.equal(settingsListeners.size, 0)
  for (const key of Core.BOOLEAN_KEYS) {
    assert.equal(dom.window.document.documentElement.hasAttribute(Core.rootAttributeFor(key)), false)
  }
  assert.equal(dom.window.document.querySelector('article').isConnected, true)
})
