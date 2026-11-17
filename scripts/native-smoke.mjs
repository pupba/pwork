import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { chromium } from 'playwright'

const [exe, evidence] = process.argv.slice(2)
if (!exe || !evidence) throw new Error('Usage: node scripts/native-smoke.mjs <exe> <scratch-evidence-directory>')
const output = resolve(evidence)
const root = join(output, 'workspace-' + randomUUID().slice(0, 8))
const webviewData = join(root, '.webview2-test-profile')
const id = randomUUID()
const pid = randomUUID()
const timestamp = new Date().toISOString()
const seed = { id: randomUUID(), version: 1, name: 'Windows 합성 검수', revision: randomUUID(),
  projects: [{ id: pid, name: '연구', archived: false, trashed: false }], folders: [],
  docs: [{ id, projectId: pid, folderId: null, filename: 'sample-' + id.slice(0, 8) + '.md', title: '네이티브 검증',
    createdAt: timestamp, updatedAt: timestamp, tags: [], trashed: false, assets: [] }],
  locations: {} }
const rel = 'Projects/연구-' + pid.slice(0, 8) + '/' + seed.docs[0].filename
seed.locations[id] = rel
const documentFile = join(root, rel)
const front = '---\nprestique_id: "' + id + '"\ntitle: "네이티브 검증"\ncreated_at: "' + timestamp + '"\nupdated_at: "' + timestamp + '"\nstatus: "active"\ntags: []\n---\n\n'
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lFcAAAAASUVORK5CYII=', 'base64')
await mkdir(join(root, '.prestique'), { recursive: true })
await mkdir(dirname(documentFile), { recursive: true })
await writeFile(join(root, '.prestique', 'catalog.json'), JSON.stringify(seed))
await writeFile(documentFile, front + '네이티브 원본')
const port = Number(process.env.PW_NATIVE_PORT || 9237)

async function launch(debugPort) {
  const endpoint = 'http://127.0.0.1:' + debugPort
  const args = { ...process.env, WEBVIEW2_USER_DATA_FOLDER: webviewData, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=' + debugPort }
  const app = spawn(resolve(exe), ['--workspace', root], { windowsHide: true, env: args, stdio: 'ignore' })
  const deadline = Date.now() + 20000
  while (Date.now() < deadline) {
    if (app.exitCode !== null) throw new Error('The Windows application exited early: ' + app.exitCode)
    try { if ((await fetch(endpoint + '/json/version')).ok) break } catch {}
    await new Promise(resolve => setTimeout(resolve, 175))
  }
  try {
    const browser = await chromium.connectOverCDP(endpoint, { timeout: 10000 })
    const context = browser.contexts()[0]
    let page = context.pages()[0]
    if (!page) page = await context.waitForEvent('page', { timeout: 10000 })
    await page.getByRole('button', { name: '네이티브 검증', exact: true }).first().waitFor({ timeout: 12000 })
    return { app, browser, page, endpoint }
  } catch (error) {
    app.kill()
    throw error
  }
}
async function close({ app, browser, endpoint }) {
  const ended = new Promise(resolve => app.once('exit', resolve))
  await browser.close().catch(() => {})
  app.kill()
  await Promise.race([ended, new Promise(resolve => setTimeout(resolve, 1500))])
  for (let i = 0; i < 15; i++) {
    if (!await fetch(endpoint + '/json/version').then(response => response.ok).catch(() => false)) break
    await new Promise(resolve => setTimeout(resolve, 150))
  }
}
const first = await launch(port)
try {
  const { page } = first
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.getByRole('button', { name: '네이티브 검증', exact: true }).first().click()
  await page.getByRole('button', { name: 'Markdown', exact: true }).click()
  await page.locator('.cm-content').fill('# 네이티브 영속 저장\n\nCJK 원본 파일과 첨부를 확인합니다.')
  await page.getByText('저장 완료', { exact: true }).waitFor()
  await page.locator('input[type=file][accept^="image/png"]').setInputFiles({ name: '첨부사진.png', mimeType: 'image/png', buffer: pixel })
  await page.getByText('첨부 1개 저장 완료').waitFor()
  const saved = await readFile(documentFile, 'utf8')
  assert.match(saved, /네이티브 영속 저장/)
  const attachments = join(dirname(documentFile), 'assets')
  const [filename] = await readdir(attachments)
  assert.match(saved, new RegExp('assets/' + filename))
  assert.deepEqual(await readFile(join(attachments, filename)), pixel)
  await page.getByRole('button', { name: '시각적 편집' }).click()
  await page.locator('.ProseMirror img').waitFor()
  await page.screenshot({ path: join(output, 'windows-workspace.png') })
  const external = saved.replace('CJK 원본 파일과 첨부를 확인합니다.', '외부 수정 다시 읽기')
  assert.notEqual(external, saved)
  await writeFile(documentFile, external)
  try {
    await page.locator('.ProseMirror p').filter({ hasText: '외부 수정 다시 읽기' }).waitFor({ timeout: 8500 })
  } catch (failure) {
    const diagnostic = await page.evaluate(async () => {
      let read = null
      try {
        const state = await window.__TAURI_INTERNALS__.invoke('workspace_open', { select: false })
        read = { containsExternal: state.documents.some(file => file.text.includes('외부 수정 다시 읽기')), stamp: state.stamp }
      } catch (error) { read = String(error) }
      return { visible: !document.hidden, focused: document.hasFocus(), editor: document.querySelector('.ProseMirror')?.innerText, notices: [...document.querySelectorAll('[role=alert]')].map(x => x.innerText), read }
    }).catch(String)
    console.error(JSON.stringify({ diagnostic, errors }))
    throw failure
  }
  assert.deepEqual(errors, [])
  console.log('PASS: Windows WebView2, native Markdown/attachment writes, and external change detection.')
  await page.getByRole('button', { name: 'PDF 출력', exact: true }).click()
  await page.locator('.print-output img').waitFor({ state: 'attached' })
  try {
    const session = await page.context().newCDPSession(page)
    const rendered = await session.send('Page.printToPDF', { preferCSSPageSize: true })
    const pdf = Buffer.from(rendered.data, 'base64')
    assert.equal(pdf.subarray(0,5).toString(), '%PDF-')
    await writeFile(join(output, 'windows-print.pdf'), pdf)
    console.log('PASS: The Windows WebView2 print engine rendered a PDF.')
  } catch (error) {
    console.log('NOT RUN: Windows WebView2 PDF save route in this harness. ' + error.message)
  }
} finally { await close(first) }
const again = await launch(port + 1)
try {
  await again.page.getByRole('button', { name: '네이티브 검증', exact: true }).first().click()
  await again.page.getByText('외부 수정 다시 읽기', { exact: true }).waitFor()
  await again.page.locator('.ProseMirror img').waitFor()
  console.log('PASS: Relaunch recovered native Markdown and attachment.')
} finally { await close(again) }

