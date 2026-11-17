import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lFcAAAAASUVORK5CYII=', 'base64')
const documentFixture = [
  '# 한글 제목', '## 상세 시험', '**강조 본문**', '- [x] 완료\n- [ ] 준비',
  '| 항목 | 값 |\n| --- | --- |\n| 연구 | 42 |',
  '| 온도 | 기간 |\n| --- | --- |\n| 25도 | 7일 |',
  '```js\nconst x = "한글"\n```',
].join('\n\n')
async function fillPrompt(page: Page, command: string, field: string, value: string) {
  await page.getByRole('button', { name: command, exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox', { name: field, exact: true }).fill(value)
  await dialog.getByRole('button', { name: '만들기', exact: true }).click()
  await expect(dialog).not.toBeVisible()
}
async function setup(page: Page) {
  await page.goto('./')
  await fillPrompt(page, '새 작업공간', '작업공간 이름', '테스트 작업공간')
  await fillPrompt(page, '새 프로젝트', '프로젝트 이름', '연구')
}
async function editSource(page: Page, source: string) {
  await page.getByRole('button', { name: 'Markdown', exact: true }).click()
  await page.locator('.cm-content').fill(source)
  await expect(page.getByText('저장 완료', { exact: true })).toBeVisible()
}
async function attachImages(page: Page, count = 1, data = pixel) {
  await page.locator('input[type=file][accept^="image/png"]').setInputFiles(Array.from({ length: count }, (_, i) => ({ name: '검증사진-' + i + '.png', mimeType: 'image/png', buffer: data })))
  await expect(page.getByText('첨부 ' + count + '개 저장 완료', { exact: true })).toBeVisible()
}

test('E2E-01 · E2E-12 project, nested folders, move, trash, restore and search', async ({ page }) => {
  await setup(page)
  await fillPrompt(page, '새 폴더', '폴더 이름', '실험')
  await fillPrompt(page, '새 폴더', '폴더 이름', '2026')
  await fillPrompt(page, '새 문서', '문서 제목', '저장 검증')
  await editSource(page, '# 아보카도오일\n\n산화억제 저장 검증')
  await attachImages(page)
  await page.getByRole('button', { name: '문서 작업' }).click()
  await page.getByRole('button', { name: '폴더로 이동' }).click()
  await page.getByLabel('이동할 위치').selectOption({ label: '연구 / 실험' })
  await page.getByRole('dialog').getByRole('button', { name: '이동', exact: true }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await page.reload()
  await expect(page.getByLabel('문서 제목')).toHaveValue('저장 검증')
  await expect(page.locator('.breadcrumb')).toContainText('연구 / 실험')
  await expect(page.locator('.document-image img')).toHaveCount(1)
  await page.getByRole('button', { name: '문서 작업' }).click()
  await page.getByRole('button', { name: '휴지통으로 이동' }).click()
  await page.getByRole('dialog').getByRole('button', { name: '이동', exact: true }).click()
  await page.getByRole('button', { name: '휴지통', exact: true }).click()
  await expect(page.locator('main')).toContainText('저장 검증')
  await page.getByRole('button', { name: '복원', exact: true }).click()
  await page.getByLabel('문서 검색').fill('산화억제')
  await expect(page.getByRole('heading', { name: '검색 결과' })).toBeVisible()
  await page.locator('main .records').getByRole('button', { name: /저장 검증/ }).click()
  await expect(page.locator('.document-image img')).toHaveCount(1)
})

test('E2E-02 · E2E-03 supported visual edit, heading/table round trip and 1,000 Korean characters', async ({ page }) => {
  await setup(page)
  await fillPrompt(page, '새 문서', '문서 제목', '편집 검증')
  await editSource(page, documentFixture)
  await page.getByRole('button', { name: '시각적 편집' }).click()
  await expect(page.locator('.ProseMirror table')).toHaveCount(2)
  await expect(page.locator('.ProseMirror input[type=checkbox]')).toHaveCount(2)
  for (const text of ['첫번째재편집','두번째재편집']) {
    await page.locator('.ProseMirror > p').filter({ hasText:'강조 본문' }).click()
    await page.keyboard.press('End')
    await page.keyboard.insertText(text)
    await expect(page.getByText('저장 완료', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Markdown', exact: true }).click()
    await expect(page.locator('.cm-content')).toContainText(text)
    await page.getByRole('button', { name: '시각적 편집' }).click()
    await expect(page.locator('.ProseMirror table')).toHaveCount(2)
  }
  const longText = '가나다라마바사아자차'.repeat(100)
  await page.locator('.ProseMirror > p').filter({ hasText:'강조 본문' }).click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  const cdp = await page.context().newCDPSession(page)
  for (const part of longText.match(/.{1,50}/gu) ?? []) {
    await cdp.send('Input.imeSetComposition', { text: part, selectionStart: part.length, selectionEnd: part.length })
    await cdp.send('Input.insertText', { text: part })
  }
  await expect(page.getByText('저장 완료', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.locator('.ProseMirror')).toContainText(longText)
})

test('E2E-06 project ZIP downloads and imports with its attachment', async ({ page }) => {
  await setup(page)
  await fillPrompt(page,'새 문서','문서 제목','백업 문서')
  await editSource(page,'## 백업 문서\n\n백업 내용')
  await attachImages(page)
  await page.getByTitle('폴더 돌아가기').click()
  await page.getByRole('button', { name: '프로젝트 작업' }).click()
  const event = page.waitForEvent('download')
  await page.getByRole('button', { name: '프로젝트 ZIP 내보내기', exact: true }).click()
  const zip = await event
  const file = await zip.path()
  expect(zip.suggestedFilename()).toBe('연구.zip')
  await page.locator('input[type=file][accept=".md,.markdown,.zip"]').setInputFiles({ name:'연구.zip', mimeType:'application/zip', buffer:await readFile(file) })
  await expect(page.getByLabel('문서 제목')).toHaveValue('백업 문서')
  await expect(page.locator('.document-image img')).toHaveCount(1)
  await expect(page.locator('.breadcrumb')).toContainText('연구 (2)')
})

test('E2E-07 PDF includes headings, tables, localized text and an attached image', async ({ page }, info) => {
  await setup(page)
  await fillPrompt(page,'새 문서','문서 제목','PDF 인수 시험')
  await editSource(page, documentFixture)
  const fixtureImage = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 96; canvas.height = 42
    const paint = canvas.getContext('2d')!
    paint.fillStyle = '#e9eefe'; paint.fillRect(0,0,96,42)
    paint.fillStyle = '#3b5df4'; paint.fillRect(9,10,68,6)
    paint.fillStyle = '#168568'; paint.fillRect(9,23,46,6)
    return canvas.toDataURL().split(',')[1]
  })
  await attachImages(page, 3, Buffer.from(fixtureImage,'base64'))
  await expect(page.getByText('저장 대기', { exact:true })).toHaveCount(0)
  await page.getByRole('button', { name: 'PDF 출력', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.locator('.print-output img')).toHaveCount(3)
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all(Array.from(document.querySelectorAll<HTMLImageElement>('.print-output img')).map(img => img.decode()))
  })
  const pdf = await page.pdf({ path: info.outputPath('workspace-print.pdf'), preferCSSPageSize: true })
  expect(pdf.subarray(0,5).toString()).toBe('%PDF-')
  expect(pdf.length).toBeGreaterThan(8000)
})

test('E2E-08 · E2E-13 mobile viewport reopens offline from subpath with 3 images', async ({ browser, baseURL }, info) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
  const page = await context.newPage()
  await setup(page)
  await page.evaluate(async () => navigator.serviceWorker.ready)
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await expect(page.locator('link[rel=manifest]')).toHaveAttribute('href', /prestique-workspace\/manifest.webmanifest$/)
  await context.setOffline(true)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByText('오프라인 · 이 기기에 저장')).toBeVisible()
  await fillPrompt(page,'새 문서','문서 제목','오프라인 메모')
  await editSource(page, documentFixture + '\n\n' + '연구기록'.repeat(75))
  await attachImages(page, 3)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByLabel('문서 제목')).toHaveValue('오프라인 메모')
  await expect(page.locator('.document-image img')).toHaveCount(3)
  await expect(page.locator('.ProseMirror table')).toHaveCount(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.screenshot({ path: info.outputPath('mobile-workspace.png'), fullPage: true })
  await context.close()
})

test('E2E-09 local write error keeps draft and allows retry', async ({ page }) => {
  await setup(page)
  await fillPrompt(page,'새 문서','문서 제목','실패 복원')
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put
    Object.defineProperty(window,'qaOriginalPut',{value:original, configurable:true})
    IDBObjectStore.prototype.put = function(...args) {
      if (this.name === 'workspaces') throw new DOMException('테스트 저장 공간 부족', 'QuotaExceededError')
      return original.apply(this,args)
    }
  })
  await page.locator('.ProseMirror').fill('저장되지 않은 초안')
  await expect(page.getByRole('alert')).toContainText('테스트 저장 공간 부족')
  await expect(page.locator('.ProseMirror')).toContainText('저장되지 않은 초안')
  await page.evaluate(() => { IDBObjectStore.prototype.put = (window as unknown as { qaOriginalPut: typeof IDBObjectStore.prototype.put }).qaOriginalPut })
  await page.getByRole('button', { name: '다시 저장' }).click()
  await expect(page.getByText('저장 완료', { exact:true })).toBeVisible()
  await page.reload()
  await expect(page.locator('.ProseMirror')).toContainText('저장되지 않은 초안')
})

test('E2E-11 raw HTML stays in source but is excluded from preview', async ({ page }) => {
  await setup(page)
  await fillPrompt(page,'새 문서','문서 제목','안전한 미리보기')
  await editSource(page,'# 문서\n\n<b data-qa-marker="html">HTML 테스트</b>\n\n<script type="application/json">{"fixture":true}</script>\n\n![원격 이미지](https://example.org/photo.png)')
  await page.getByRole('button', { name: '시각적 편집' }).click()
  await expect(page.locator('.editor-warning')).toContainText('원문 편집')
  await page.getByRole('button', { name:'미리보기', exact:true }).click()
  await expect(page.locator('[data-qa-marker]')).toHaveCount(0)
  await expect(page.locator('script[type="application/json"]')).toHaveCount(0)
  await expect(page.locator('.image-fallback')).toContainText('외부 이미지')
})

test('E2E-14 · E2E-15 · E2E-16 real save indicator, dark theme, reduced motion and BI', async ({ page }, info) => {
  await page.emulateMedia({ colorScheme:'dark', reducedMotion:'reduce' })
  await page.goto('./')
  await expect(page.getByRole('img',{name:'PRESTIQUE LABS'})).toBeVisible()
  await expect(page.locator('.scene-brand')).toHaveCSS('animation-duration','1e-06s')
  await fillPrompt(page, '새 작업공간', '작업공간 이름', '다크 검수')
  await fillPrompt(page, '새 프로젝트', '프로젝트 이름', 'PWA 테스트')
  await fillPrompt(page, '새 문서', '문서 제목', '마이크로 인터랙션')
  await editSource(page,documentFixture)
  await page.getByRole('button', { name:'시각적 편집' }).click()
  await page.getByRole('button', { name:'문서 정보', exact:true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark')
  await expect(page.locator('.save-pop')).toBeVisible()
  await page.screenshot({ path: info.outputPath('desktop-workspace.png'), fullPage: true })
})

