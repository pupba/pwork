import { expect, test } from '@playwright/test'

test('E2E-17 · three large GPU-decoded images preserve editor input and survive reload', async ({ page }, info) => {
  await page.goto('./')
  for (const [button, field, value] of [
    ['새 작업공간','작업공간 이름','성능'],
    ['새 프로젝트','프로젝트 이름','대용량'],
    ['새 문서','문서 제목','이미지 검수'],
  ]) {
    await page.getByRole('button',{name:button,exact:true}).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('textbox',{name:field}).fill(value)
    await dialog.getByRole('button',{name:'만들기',exact:true}).click()
    await expect(dialog).not.toBeVisible()
  }
  await page.locator('.ProseMirror').fill('성능 검수 기준 문단')
  await expect(page.getByText('저장 완료',{exact:true})).toBeVisible()
  const fixture = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 800
    const context = canvas.getContext('2d')!
    const data = context.createImageData(800,800)
    let seed = 2011
    for (let i=0;i<data.data.length;i+=4) {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5
      data.data[i] = seed & 255; data.data[i+1] = (seed >>> 8) & 255; data.data[i+2] = (seed >>> 16) & 255; data.data[i+3] = 255
    }
    context.putImageData(data,0,0)
    return canvas.toDataURL()
  })
  const buffer = Buffer.from(fixture.split(',')[1],'base64')
  expect(buffer.length).toBeGreaterThan(1_048_576)
  const started = performance.now()
  await page.locator('input[type=file][accept^="image/png"]').setInputFiles(Array.from({length:3},(_,i)=>({name:'large-'+i+'.png',mimeType:'image/png',buffer})))
  await expect(page.getByText('첨부 3개 저장 완료')).toBeVisible()
  const writeMs = performance.now() - started
  await expect(page.locator('.ProseMirror img')).toHaveCount(3)
  await page.locator('.ProseMirror > p').first().click()
  await page.keyboard.press('End')
  const result = await page.evaluate(async () => {
    const editor = document.querySelector<HTMLElement>('.ProseMirror p')!
    const time = performance.now()
    // Measure scheduling while all image nodes are present.
    await new Promise(requestAnimationFrame)
    return { frameMs: Math.round(performance.now() - time), height: editor.offsetHeight }
  })
  await page.keyboard.insertText('첨부 후 문서 입력 유지')
  await expect(page.getByText('저장 완료',{exact:true})).toBeVisible()
  await page.reload()
  await expect(page.locator('.ProseMirror')).toContainText('첨부 후 문서 입력 유지')
  await expect(page.locator('.ProseMirror img')).toHaveCount(3)
  await info.attach('measurement', { contentType:'application/json', body:JSON.stringify({ attachmentBytes:buffer.length, writeMs:Math.round(writeMs), nextFrameMs:result.frameMs }) })
})

