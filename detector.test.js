const assert = require('node:assert/strict')
const test = require('node:test')
const { JSDOM } = require('jsdom')

const { MARKERS, scan } = require('./detector.js')

const messageFixture = `
  <article id="message" class="_body_messagehash_1">
    <div class="_messageContents_contenthash_1">
      <div id="icon" role="button" style="background-image:url('/api/v3/files/user-icon')"></div>
      <div class="_messageHeader_headerhash_1">
        <span id="display">Alice</span><span id="badge">Bot</span>
        <span id="username">@alice_bot</span><span id="date" title="2026-09-12">12:00</span>
      </div>
      <div class="markdown-body">hello <span id="mention">@bob</span></div>
    </div>
    <div id="stamps" class="_stampWrapper_stamphash_1">
      <div aria-label="+1, 1件のリアクション"><img src="/api/v3/files/stamp" title=":+1:" alt=":+1:"></div>
    </div>
  </article>
  <div class="custom-ad">ad</div>
`

test('marks a semantic message, its author fields, stamps, and custom matches', () => {
  const dom = new JSDOM(messageFixture)
  const { document } = dom.window
  const result = scan(document, ['.custom-ad'])

  assert.equal(document.querySelector('#message').hasAttribute(MARKERS.botMessage), true)
  assert.equal(document.querySelector('#stamps').hasAttribute(MARKERS.stamps), true)
  assert.equal(document.querySelector('#icon').hasAttribute(MARKERS.authorInfo), true)
  assert.equal(document.querySelector('#display').hasAttribute(MARKERS.authorInfo), true)
  assert.equal(document.querySelector('#username').hasAttribute(MARKERS.authorInfo), true)
  assert.equal(document.querySelector('#badge').hasAttribute(MARKERS.authorInfo), false)
  assert.equal(document.querySelector('#date').hasAttribute(MARKERS.authorInfo), false)
  assert.equal(document.querySelector('#mention').hasAttribute(MARKERS.authorInfo), false)
  assert.equal(document.querySelector('._messageContents_contenthash_1').hasAttribute(MARKERS.authorLayout), true)
  assert.equal(document.querySelector('.custom-ad').hasAttribute(MARKERS.custom), true)
  assert.deepEqual(result.invalidSelectors, [])

  scan(document, ['.custom-ad'])
  assert.equal(document.querySelectorAll(`[${MARKERS.botMessage}]`).length, 1)
})

test('does not overmatch uploads, ordinary text, sidebars, or generic classes', () => {
  const dom = new JSDOM(`
    <img id="upload" src="/api/v3/files/upload" title="holiday" alt="holiday">
    <article class="_body_hash"><div class="_messageContents_hash">
      <div class="_messageHeader_hash"><span>Alice</span><span>Member</span></div>
      <div class="markdown-body">Bot @alice</div>
    </div></article>
    <aside><section class="_container_sidebar"><h2>参加BOT</h2><span>Bot</span></section></aside>
    <div class="_container_random"><span>Bot</span></div>
  `)
  scan(dom.window.document, [])
  assert.equal(dom.window.document.querySelectorAll(`[${MARKERS.botMessage}]`).length, 0)
  assert.equal(dom.window.document.querySelectorAll(`[${MARKERS.stamps}]`).length, 0)
  assert.equal(dom.window.document.querySelector('#upload').hasAttribute(MARKERS.attachment), false)
})

test('marks expanded and structurally qualified collapsed viewer cards only', () => {
  const dom = new JSDOM(`
    <aside id="sidebar" class="_sidebar_hash">
      <section id="collapsed" class="_sidebarItem_hash">
        <div data-is-large-padding><div class="_userIcon_hash" role="img" style="background-image:url('/api/v3/files/u')"></div><b>+2</b></div>
      </section>
      <section class="_sidebarItem_hash"><header><h2>トピック</h2></header></section>
      <section id="expanded" class="_container_hash"><header><h2>閲覧者</h2></header><div>Alice</div></section>
    </aside>
    <nav><div id="nav-icons"><div class="_userIcon_hash" role="img"></div><b>+2</b></div></nav>
    <div id="unrelated"><div class="_userIcon_hash" role="img"></div><b>+2</b></div>
  `)
  scan(dom.window.document, [])
  assert.equal(dom.window.document.querySelector('#expanded').hasAttribute(MARKERS.viewers), true)
  assert.equal(dom.window.document.querySelector('#collapsed').hasAttribute(MARKERS.viewers), true)
  assert.equal(dom.window.document.querySelector('#nav-icons').hasAttribute(MARKERS.viewers), false)
  assert.equal(dom.window.document.querySelector('#unrelated').hasAttribute(MARKERS.viewers), false)
})

test('marks composer typing, OGP cards, and qualified attachments', () => {
  const dom = new JSDOM(`
    <div class="_messageInput_hash">
      <div id="typing" class="_typingUsers_hash"><div class="_typingAnimation_hash"></div><span>Alice is typing</span></div>
      <textarea></textarea>
    </div>
    <article class="_body_hash"><div class="_messageContents_hash">
      <div class="_messageHeader_hash"><span>Alice</span></div>
      <div class="markdown-body"><a id="plain-external" href="https://example.com">plain</a><a id="plain-file" href="/api/v3/files/plain">file text</a></div>
      <div class="_ogpList_hash"><a id="ogp" class="_container_hash" href="https://example.com" target="_blank" rel="noopener noreferrer"><img src="https://example.com/a.png"><div class="_description_hash">Example title</div></a></div>
      <div id="files" class="_messageEmbeddingsList_hash"><a href="/api/v3/files/id" download>report.pdf</a><video src="blob:test"></video></div>
    </div></article>
  `, { url: 'https://q.trap.jp/channels/general' })
  scan(dom.window.document, [])
  assert.equal(dom.window.document.querySelector('#typing').hasAttribute(MARKERS.typing), true)
  assert.equal(dom.window.document.querySelector('#ogp').hasAttribute(MARKERS.linkPreview), true)
  assert.equal(dom.window.document.querySelector('#files').hasAttribute(MARKERS.attachment), true)
  assert.equal(dom.window.document.querySelector('#plain-external').hasAttribute(MARKERS.linkPreview), false)
  assert.equal(dom.window.document.querySelector('#plain-file').hasAttribute(MARKERS.attachment), false)
})

test('isolates runtime-invalid custom selectors', () => {
  const dom = new JSDOM('<div class="ok"></div>')
  const result = scan(dom.window.document, ['.ok', 'div['])
  assert.equal(dom.window.document.querySelector('.ok').hasAttribute(MARKERS.custom), true)
  assert.deepEqual(result.invalidSelectors, ['div['])
})
