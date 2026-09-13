;(function expose(globalObject, factory) {
  const core = globalObject.QHiderCore ||
    (typeof require === 'function' ? require('./core.js') : null)
  const detector = globalObject.QHiderDetector ||
    (typeof require === 'function' ? require('./detector.js') : null)
  const api = factory(core, detector)
  globalObject.QHiderApp = api
  if (typeof module === 'object' && module.exports) module.exports = api
})(globalThis, (DefaultCore, DefaultDetector) => {
  function createSettingsStorage(chromeApi, logger = console, Core = DefaultCore) {
    let sessionSettings = Core.normalizeSettings(Core.DEFAULT_SETTINGS)
    let usingFallback = false
    const warned = new Set()
    const warnOnce = (code, message, error) => {
      usingFallback = true
      if (warned.has(code)) return
      warned.add(code)
      logger.warn(`Q-Hider: ${message}`, error)
    }

    async function load() {
      try {
        const stored = await chromeApi.storage.sync.get({
          [Core.SETTINGS_KEY]: Core.DEFAULT_SETTINGS
        })
        sessionSettings = Core.normalizeSettings(stored[Core.SETTINGS_KEY])
      } catch (error) {
        warnOnce('read', '設定を読み込めないため、このタブ内の設定を使います', error)
      }
      return { ...sessionSettings }
    }

    async function save(value) {
      sessionSettings = Core.normalizeSettings(value)
      try {
        await chromeApi.storage.sync.set({
          [Core.SETTINGS_KEY]: { ...sessionSettings }
        })
      } catch (error) {
        warnOnce('write', '設定を保存できないため、このタブ内だけで反映します', error)
      }
      return { ...sessionSettings }
    }

    function subscribe(listener) {
      const event = chromeApi.storage.onChanged
      if (!event?.addListener) return () => {}
      const handler = (changes, areaName) => {
        if (areaName !== 'sync' || !Object.hasOwn(changes, Core.SETTINGS_KEY)) return
        sessionSettings = Core.normalizeSettings(changes[Core.SETTINGS_KEY].newValue)
        listener({ ...sessionSettings })
      }
      event.addListener(handler)
      return () => event.removeListener?.(handler)
    }

    return { load, save, subscribe, isUsingFallback: () => usingFallback }
  }

  function applyRootSettings(root, value, Core = DefaultCore) {
    const settings = Core.normalizeSettings(value)
    for (const key of Core.BOOLEAN_KEYS) {
      const attribute = Core.rootAttributeFor(key)
      if (settings[key]) root.setAttribute(attribute, 'true')
      else root.removeAttribute(attribute)
    }
    return settings
  }

  function createQHiderApp(dependencies = {}) {
    const Core = dependencies.Core ?? DefaultCore
    const detector = dependencies.detector ?? DefaultDetector
    const document = dependencies.document ?? globalThis.document
    const logger = dependencies.logger ?? console
    const Observer = dependencies.MutationObserver ?? document.defaultView?.MutationObserver
    const scheduleTimeout = dependencies.setTimeout ?? globalThis.setTimeout.bind(globalThis)
    const cancelTimeout = dependencies.clearTimeout ?? globalThis.clearTimeout.bind(globalThis)
    const storage = dependencies.storage ?? createSettingsStorage(
      dependencies.chromeApi ?? globalThis.chrome,
      logger,
      Core
    )
    const customMarker = detector?.MARKERS?.custom ?? 'data-q-hider-custom'

    let settings = Core.normalizeSettings(Core.DEFAULT_SETTINGS)
    let selectors = []
    let observer = null
    let unsubscribe = () => {}
    let timer = null
    let started = false
    let lifecycleVersion = 0
    const pendingRoots = new Set()
    const warnedSelectors = new Set()

    const parseSelectors = value => {
      const parsed = Core.parseCustomSelectors(value, document)
      if (parsed.ok) return parsed.selectors
      const warningKey = `stored:${parsed.line}:${parsed.selector}`
      if (!warnedSelectors.has(warningKey)) {
        warnedSelectors.add(warningKey)
        logger.warn(`Q-Hider: 保存されたカスタムセレクターの${parsed.line}行目を使用できません`)
      }
      return []
    }

    const scanRoot = root => {
      const result = detector.scan(root, selectors) ?? {}
      for (const selector of result.invalidSelectors ?? []) {
        if (warnedSelectors.has(selector)) continue
        warnedSelectors.add(selector)
        logger.warn(`Q-Hider: カスタムセレクターを適用できません: ${selector}`)
      }
      return result
    }

    function applySettings(value) {
      settings = applyRootSettings(document.documentElement, value, Core)
      for (const element of document.querySelectorAll(`[${customMarker}]`)) {
        element.removeAttribute(customMarker)
      }
      selectors = parseSelectors(settings.customSelectors)
      if (selectors.length > 0) {
        document.documentElement.setAttribute('data-q-hider-hide-custom', 'true')
      } else {
        document.documentElement.removeAttribute('data-q-hider-hide-custom')
      }
      return scanRoot(document)
    }

    const addPendingRoot = root => {
      if (!root || !root.isConnected) return
      for (const existing of [...pendingRoots]) {
        if (existing === root || existing.contains?.(root)) return
        if (root.contains?.(existing)) pendingRoots.delete(existing)
      }
      pendingRoots.add(root)
    }

    const nearbyRoot = node => {
      const element = node?.nodeType === 1 ? node : node?.parentElement
      return element?.closest?.(
        '[class*="_body_"], [class*="_sidebarItem_"], [class*="_messageInput_"]'
      ) ?? element
    }

    function reconcile(roots) {
      const values = roots
        ? (Array.isArray(roots) ? roots : [...roots])
        : [document]
      return values.filter(root => root?.isConnected !== false).map(scanRoot)
    }

    const flush = () => {
      timer = null
      const roots = [...pendingRoots]
      pendingRoots.clear()
      reconcile(roots)
    }

    const onMutations = mutations => {
      for (const mutation of mutations) {
        if (
          mutation.type === 'attributes' &&
          mutation.attributeName?.startsWith('data-q-hider-')
        ) continue
        const added = [...(mutation.addedNodes ?? [])]
        if (added.length === 0) addPendingRoot(nearbyRoot(mutation.target))
        for (const node of added) addPendingRoot(nearbyRoot(node))
      }
      if (pendingRoots.size === 0 || timer !== null) return
      timer = scheduleTimeout(flush, 50)
    }

    async function start() {
      if (started) return
      started = true
      const version = ++lifecycleVersion
      let loaded
      try {
        loaded = await storage.load()
      } catch (error) {
        if (version === lifecycleVersion) started = false
        throw error
      }
      if (!started || version !== lifecycleVersion) return
      settings = Core.normalizeSettings(loaded)
      applySettings(settings)
      unsubscribe = storage.subscribe(nextSettings => applySettings(nextSettings))
      if (Observer) {
        observer = new Observer(onMutations)
        observer.observe(document.documentElement, {
          attributes: true,
          characterData: true,
          childList: true,
          subtree: true
        })
      }
    }

    function stop() {
      if (!started) return
      started = false
      lifecycleVersion += 1
      observer?.disconnect()
      observer = null
      unsubscribe()
      unsubscribe = () => {}
      if (timer !== null) cancelTimeout(timer)
      timer = null
      pendingRoots.clear()
      applyRootSettings(document.documentElement, Core.DEFAULT_SETTINGS, Core)
      document.documentElement.removeAttribute('data-q-hider-hide-custom')
    }

    return { start, stop, reconcile, applySettings }
  }

  return { createSettingsStorage, applyRootSettings, createQHiderApp }
})
