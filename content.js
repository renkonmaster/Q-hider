try {
  const qHiderApp = globalThis.QHiderApp.createQHiderApp({
    document,
    chromeApi: chrome
  })
  void qHiderApp.start().catch(error => {
    console.error('Q-Hider: 起動に失敗しました', error)
  })
} catch (error) {
  console.error('Q-Hider: 起動に失敗しました', error)
}
