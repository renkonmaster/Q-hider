;(function expose(globalObject, factory) {
  const api = factory()
  globalObject.QHiderCore = api
  if (typeof module === 'object' && module.exports) module.exports = api
})(globalThis, () => {
  const SETTINGS_KEY = 'qHiderSettingsV1'
  const BOOLEAN_KEYS = Object.freeze([
    'hideStamps',
    'hideViewers',
    'hideAuthorInfo',
    'hideBotMessages',
    'disableAnimations',
    'hideTyping',
    'hideLinkPreviews',
    'hideAttachments'
  ])
  const DEFAULT_SETTINGS = Object.freeze({
    hideStamps: false,
    hideViewers: false,
    hideAuthorInfo: false,
    hideBotMessages: false,
    disableAnimations: false,
    hideTyping: false,
    hideLinkPreviews: false,
    hideAttachments: false,
    customSelectors: ''
  })
  const ROOT_ATTRIBUTES = Object.freeze({
    hideStamps: 'data-q-hider-hide-stamps',
    hideViewers: 'data-q-hider-hide-viewers',
    hideAuthorInfo: 'data-q-hider-hide-author-info',
    hideBotMessages: 'data-q-hider-hide-bot-messages',
    disableAnimations: 'data-q-hider-disable-animations',
    hideTyping: 'data-q-hider-hide-typing',
    hideLinkPreviews: 'data-q-hider-hide-link-previews',
    hideAttachments: 'data-q-hider-hide-attachments'
  })

  function normalizeSettings(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value)
      ? value
      : {}
    const result = {}
    for (const key of BOOLEAN_KEYS) {
      result[key] = typeof source[key] === 'boolean' ? source[key] : false
    }
    result.customSelectors = typeof source.customSelectors === 'string'
      ? source.customSelectors
      : ''
    return result
  }

  function rootAttributeFor(key) {
    return ROOT_ATTRIBUTES[key] ?? null
  }

  function parseCustomSelectors(value, validatorDocument) {
    const selectors = []
    const seen = new Set()
    const lines = String(value ?? '').split(/\r?\n/u)
    for (let index = 0; index < lines.length; index += 1) {
      const selector = lines[index].trim()
      if (!selector || seen.has(selector)) continue
      try {
        validatorDocument.querySelector(selector)
      } catch {
        return { ok: false, line: index + 1, selector }
      }
      seen.add(selector)
      selectors.push(selector)
    }
    return { ok: true, selectors }
  }

  return {
    SETTINGS_KEY,
    DEFAULT_SETTINGS,
    BOOLEAN_KEYS,
    normalizeSettings,
    parseCustomSelectors,
    rootAttributeFor
  }
})
