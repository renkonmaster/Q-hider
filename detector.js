;(function expose(globalObject, factory) {
  const api = factory()
  globalObject.QHiderDetector = api
  if (typeof module === 'object' && module.exports) module.exports = api
})(globalThis, () => {
  const MARKERS = Object.freeze({
    stamps: 'data-q-hider-stamps',
    viewers: 'data-q-hider-viewers',
    authorInfo: 'data-q-hider-author-info',
    authorLayout: 'data-q-hider-author-layout',
    botMessage: 'data-q-hider-bot-message',
    typing: 'data-q-hider-typing',
    linkPreview: 'data-q-hider-link-preview',
    attachment: 'data-q-hider-attachment',
    custom: 'data-q-hider-custom'
  })

  const includingRoot = (root, selector) => {
    const values = []
    if (root?.nodeType === 1 && root.matches(selector)) values.push(root)
    if (typeof root?.querySelectorAll === 'function') values.push(...root.querySelectorAll(selector))
    return values
  }

  const normalizedText = element => String(element?.textContent ?? '')
    .replace(/\s+/gu, ' ')
    .trim()

  const hasClassPrefix = (element, prefix) =>
    [...(element?.classList ?? [])].some(name => name.startsWith(prefix))

  const hasAnyClassPrefix = (element, prefixes) =>
    prefixes.some(prefix => hasClassPrefix(element, prefix))

  const isMessage = element =>
    (hasClassPrefix(element, '_body_') || element.tagName === 'ARTICLE') &&
    Boolean(element.querySelector('[class*="_messageContents_"]')) &&
    Boolean(element.querySelector('[class*="_messageHeader_"]'))

  const findMessage = start => {
    let current = start?.nodeType === 1 ? start : start?.parentElement
    for (let depth = 0; current && depth < 10; depth += 1, current = current.parentElement) {
      if (isMessage(current)) return current
    }
    return null
  }

  const mark = (element, marker) => {
    if (!element) return false
    element.setAttribute(marker, 'true')
    return true
  }

  function markStamps(root) {
    let count = 0
    for (const wrapper of includingRoot(root, '[class*="_stampWrapper_"]')) {
      if (!hasClassPrefix(wrapper, '_stampWrapper_') || !findMessage(wrapper)) continue
      const images = [...wrapper.querySelectorAll('img')]
      const hasStampImage = images.some(image => {
        const source = image.getAttribute('src') ?? ''
        return source.includes('/files/') && Boolean(image.getAttribute('title') || image.getAttribute('alt'))
      })
      const hasReactionLabel = [...wrapper.querySelectorAll('[aria-label]')]
        .some(element => /リアクション|reaction/iu.test(element.getAttribute('aria-label') ?? ''))
      if (hasStampImage || hasReactionLabel) {
        mark(wrapper, MARKERS.stamps)
        count += 1
      }
    }
    return count
  }

  const messageHeaders = root => includingRoot(root, '[class*="_messageHeader_"]')
    .filter(header => hasClassPrefix(header, '_messageHeader_') && findMessage(header))

  function markAuthorInfo(root) {
    const marked = new Set()
    for (const header of messageHeaders(root)) {
      const message = findMessage(header)
      const layout = header.closest('[class*="_messageContents_"]') ??
        message?.querySelector('[class*="_messageContents_"]')
      if (layout) mark(layout, MARKERS.authorLayout)

      for (const icon of message.querySelectorAll(
        '[role="button"][style*="background-image"], [class*="_userIcon_"][style*="background-image"]'
      )) {
        const style = icon.getAttribute('style') ?? ''
        if (!style.includes('/files/')) continue
        mark(icon, MARKERS.authorInfo)
        marked.add(icon)
      }

      const spans = [...header.querySelectorAll('span')].filter(span => {
        const value = normalizedText(span)
        if (!value || value === 'Bot' || span.hasAttribute('title')) return false
        if (/^\d{1,2}:\d{2}$/u.test(value)) return false
        return true
      })
      const explicit = spans.filter(span =>
        hasAnyClassPrefix(span, ['_displayName_', '_name_']) || normalizedText(span).startsWith('@')
      )
      const fallbackDisplayName = spans.find(span => !normalizedText(span).startsWith('@'))
      const names = new Set(explicit)
      if (fallbackDisplayName) names.add(fallbackDisplayName)
      for (const span of names) {
        mark(span, MARKERS.authorInfo)
        marked.add(span)
      }
      for (const span of spans.filter(item => normalizedText(item).startsWith('@'))) {
        mark(span, MARKERS.authorInfo)
        marked.add(span)
      }
    }
    return marked.size
  }

  function markBotMessages(root) {
    const messages = new Set()
    for (const header of messageHeaders(root)) {
      const badge = [...header.querySelectorAll('span')]
        .find(span => {
          if (normalizedText(span) !== 'Bot') return false
          const parent = span.parentElement
          if (parent !== header) {
            return hasClassPrefix(parent, '_badge_') ||
              (hasClassPrefix(parent, '_body_') && parent.childElementCount === 1)
          }
          const previous = span.previousElementSibling
          const next = span.nextElementSibling
          return Boolean(normalizedText(previous) && normalizedText(next).startsWith('@'))
        })
      const message = badge ? findMessage(header) : null
      if (!message) continue
      mark(message, MARKERS.botMessage)
      messages.add(message)
    }
    return messages.size
  }

  const closestViewerCard = heading => {
    const header = heading.parentElement
    const container = header?.parentElement
    if (container && container.tagName !== 'BODY') return container
    return header
  }

  function markViewers(root) {
    const cards = new Set()
    for (const heading of includingRoot(root, 'h2')) {
      if (normalizedText(heading) !== '閲覧者') continue
      const card = closestViewerCard(heading)
      if (card) {
        mark(card, MARKERS.viewers)
        cards.add(card)
      }
    }

    for (const candidate of includingRoot(root, '[class*="_sidebarItem_"]')) {
      if (!hasClassPrefix(candidate, '_sidebarItem_')) continue
      const parent = candidate.parentElement
      if (!parent || parent.firstElementChild !== candidate || candidate.closest('nav')) continue
      if (!candidate.querySelector('[data-is-large-padding]')) continue
      if (!candidate.querySelector('[class*="_userIcon_"]')) continue
      const hasKnownSibling = [...parent.querySelectorAll('h2')]
        .some(heading => ['トピック', 'メンバー', '参加BOT'].includes(normalizedText(heading)))
      if (!hasKnownSibling) continue
      mark(candidate, MARKERS.viewers)
      cards.add(candidate)
    }
    return cards.size
  }

  function markTyping(root) {
    const containers = new Set()
    for (const animation of includingRoot(root, '[class*="_typingAnimation_"]')) {
      if (!hasClassPrefix(animation, '_typingAnimation_')) continue
      let current = animation.parentElement
      for (let depth = 0; current && depth < 4; depth += 1, current = current.parentElement) {
        const typingText = /\b(?:is|are) typing\b|入力中/iu.test(normalizedText(current))
        const composer = current.querySelector('textarea') || current.parentElement?.querySelector('textarea')
        if (typingText && composer) {
          mark(current, MARKERS.typing)
          containers.add(current)
          break
        }
      }
    }
    return containers.size
  }

  const isExternalHttpLink = anchor => {
    try {
      const url = new URL(anchor.href, anchor.ownerDocument.baseURI)
      const page = new URL(anchor.ownerDocument.baseURI)
      return /^https?:$/u.test(url.protocol) && url.origin !== page.origin
    } catch {
      return false
    }
  }

  function markLinkPreviews(root) {
    const cards = new Set()
    for (const anchor of includingRoot(root, 'a[href]')) {
      if (!findMessage(anchor) || !isExternalHttpLink(anchor)) continue
      const rel = anchor.getAttribute('rel') ?? ''
      const hasPreviewStructure = Boolean(
        anchor.querySelector('img, video, iframe') &&
        (anchor.querySelector('[class*="_description_"]') || anchor.querySelector('video, iframe'))
      )
      if (anchor.target !== '_blank' || !/noopener/u.test(rel) || !hasPreviewStructure) continue
      mark(anchor, MARKERS.linkPreview)
      cards.add(anchor)
    }
    return cards.size
  }

  function markAttachments(root) {
    const containers = new Set()
    for (const element of includingRoot(
      root,
      '[class*="_messageEmbeddingsList_"], [class*="_fileList_"], [class*="_imageContainer_"]'
    )) {
      if (!hasAnyClassPrefix(element, [
        '_messageEmbeddingsList_', '_fileList_', '_imageContainer_'
      ]) || !findMessage(element)) continue
      const hasMedia = Boolean(element.querySelector('audio, video'))
      const hasFileLink = [...element.querySelectorAll('a[href]')]
        .some(anchor => (anchor.getAttribute('href') ?? '').includes('/files/'))
      const hasFileImage = [...element.querySelectorAll('img[src]')]
        .some(image => (image.getAttribute('src') ?? '').includes('/files/'))
      if (!hasMedia && !hasFileLink && !hasFileImage) continue
      mark(element, MARKERS.attachment)
      containers.add(element)
    }
    return containers.size
  }

  function markCustom(root, selectors) {
    const invalidSelectors = []
    const matches = new Set()
    for (const selector of Array.isArray(selectors) ? selectors : []) {
      try {
        for (const element of includingRoot(root, selector)) {
          mark(element, MARKERS.custom)
          matches.add(element)
        }
      } catch {
        invalidSelectors.push(selector)
      }
    }
    return { count: matches.size, invalidSelectors }
  }

  function scan(root, customSelectors = []) {
    const custom = markCustom(root, customSelectors)
    return {
      counts: {
        stamps: markStamps(root),
        viewers: markViewers(root),
        authorInfo: markAuthorInfo(root),
        botMessages: markBotMessages(root),
        typing: markTyping(root),
        linkPreviews: markLinkPreviews(root),
        attachments: markAttachments(root),
        custom: custom.count
      },
      invalidSelectors: custom.invalidSelectors
    }
  }

  return {
    MARKERS,
    scan,
    markStamps,
    markViewers,
    markAuthorInfo,
    markBotMessages,
    markTyping,
    markLinkPreviews,
    markAttachments,
    markCustom
  }
})
