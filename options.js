;(function expose(globalObject, factory) {
  const core = globalObject.QHiderCore ||
    (typeof require === 'function' ? require('./core.js') : null)
  const app = globalObject.QHiderApp ||
    (typeof require === 'function' ? require('./app.js') : null)
  const api = factory(core, app)
  globalObject.QHiderOptions = api
  if (typeof module === 'object' && module.exports) module.exports = api
})(globalThis, (Core, App) => {
  const controllers = new WeakMap()

  function createOptionsController({ document, storage }) {
    if (controllers.has(document)) return controllers.get(document)
    const form = document.querySelector('#settings-form')
    const customSelectors = document.querySelector('#custom-selectors')
    const status = document.querySelector('#status')
    let startPromise = null

    const showStatus = (message, error = false) => {
      status.textContent = message
      status.dataset.error = String(error)
    }

    const writeForm = value => {
      const settings = Core.normalizeSettings(value)
      for (const key of Core.BOOLEAN_KEYS) document.querySelector(`#${key}`).checked = settings[key]
      customSelectors.value = settings.customSelectors
    }

    const readForm = () => {
      const settings = { customSelectors: customSelectors.value }
      for (const key of Core.BOOLEAN_KEYS) settings[key] = document.querySelector(`#${key}`).checked
      return settings
    }

    const setAll = checked => {
      for (const key of Core.BOOLEAN_KEYS) document.querySelector(`#${key}`).checked = checked
      showStatus('フォームを変更しました。保存するとtraQへ反映されます。')
    }

    form.addEventListener('submit', event => {
      event.preventDefault()
      const next = readForm()
      const parsed = Core.parseCustomSelectors(next.customSelectors, document)
      if (!parsed.ok) {
        showStatus(`カスタムセレクターの${parsed.line}行目が不正です`, true)
        customSelectors.focus()
        return
      }
      void storage.save(next).then(saved => {
        writeForm(saved)
        showStatus('設定を保存しました')
      }).catch(error => {
        showStatus(error instanceof Error ? error.message : '設定を保存できませんでした', true)
      })
    })

    document.querySelector('#show-all').addEventListener('click', () => setAll(false))
    document.querySelector('#hide-all').addEventListener('click', () => setAll(true))
    document.querySelector('#reset-defaults').addEventListener('click', () => {
      writeForm(Core.DEFAULT_SETTINGS)
      showStatus('初期設定をフォームへ戻しました。保存すると反映されます。')
    })

    const controller = {
      start() {
        if (!startPromise) {
          startPromise = storage.load().then(writeForm).catch(error => {
            writeForm(Core.DEFAULT_SETTINGS)
            showStatus(error instanceof Error ? error.message : '設定を読み込めませんでした', true)
          })
        }
        return startPromise
      },
      readForm,
      writeForm
    }
    controllers.set(document, controller)
    return controller
  }

  if (typeof document !== 'undefined' && typeof chrome !== 'undefined') {
    const storage = App.createSettingsStorage(chrome)
    void createOptionsController({ document, storage }).start()
  }

  return { createOptionsController }
})
