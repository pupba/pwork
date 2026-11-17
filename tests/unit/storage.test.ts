import 'fake-indexeddb/auto'
import { expect, it } from 'vitest'
import { BlobReader, BlobWriter, ZipWriter } from '@zip.js/zip.js'
import { IndexedRepository, freshRevision } from '../../src/repository'
import { importZip, makeProjectZip, unzipSecure } from '../../src/archive'
import { assetUrl, makeDoc, makeUpload, newId, sha256 } from '../../src/domain'

const png = () => new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lFcAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' })

it('commits documents and attachments, restores both after reopen and rejects stale revision', async () => {
  const name = newId()
  const db = new IndexedRepository(name)
  const old = await db.create('통합 테스트')
  const project = { id: newId(), name: '연구', archived: false, trashed: false }
  const doc = makeDoc({ projectId: project.id, folderId: null }, '저장 시험', '한글 본문')
  const upload = await makeUpload(png(), '사진.png')
  doc.assets = [upload.asset]
  const state = freshRevision({ ...old, projects: [project], docs: [doc] })
  await db.save(old, state, [upload])
  const reopened = new IndexedRepository(name)
  expect((await reopened.open(state.id))?.docs[0].markdown).toBe('한글 본문')
  expect(await sha256(await reopened.asset(state, upload.asset))).toBe(await sha256(upload.blob))
  await expect(reopened.save(old, freshRevision(old), [])).rejects.toThrow('충돌')
  expect((await reopened.open(state.id))?.revision).toBe(state.revision)
})
it('restores 10 documents and 20 images with matching attachment bytes and relative references', async () => {
  const db = new IndexedRepository(newId())
  const old = await db.create('ZIP 검사')
  const project = { id: newId(), name: '실험 파일', archived: false, trashed: false }
  const docs = []
  const uploads = []
  for (let i = 0; i < 10; i++) {
    const doc = makeDoc({ projectId: project.id, folderId: null }, '실험 ' + i, '# 한글 제목\n\n')
    for (let j = 0; j < 2; j++) {
      const item = await makeUpload(png(), '사진 ' + j + '.png')
      doc.assets.push(item.asset); uploads.push(item)
      doc.markdown += '![샘플](' + assetUrl(item.asset) + ')\n\n'
    }
    docs.push(doc)
  }
  const next = freshRevision({ ...old, projects: [project], docs })
  await db.save(old, next, uploads)
  const zip = await makeProjectZip(next, project, db)
  const restored = await importZip(zip, '가져오기')
  expect(restored.docs).toHaveLength(10)
  expect(restored.uploads).toHaveLength(20)
  expect(restored.docs.map(doc => doc.markdown)).toEqual(docs.map(doc => doc.markdown))
  for (const [index, upload] of restored.uploads.entries()) expect(await sha256(upload.blob)).toBe(await sha256(uploads[index].blob))
})
it('validates traversal and symlink metadata and enforces compression limits on import', async () => {
  const create = async (name: string, blob: Blob, options?: { unixMode?: number; level?: number }) => {
    const writer = new ZipWriter(new BlobWriter(), { useWebWorkers: false, useCompressionStream: false })
    await writer.add(name, new BlobReader(blob), options)
    return writer.close()
  }
  for (const path of ['../outside.md', '/outside.md', 'C:/outside.md']) {
    await expect(unzipSecure(await create(path, new Blob(['fixture'])))).rejects.toThrow()
  }
  await expect(unzipSecure(await create('symlink.md', new Blob(['fixture']), { unixMode: 0o120777 }))).rejects.toThrow()
  await expect(unzipSecure(await create('repeated.md', new Blob(['x'.repeat(200000)]), { level: 9 }))).rejects.toThrow()
})

