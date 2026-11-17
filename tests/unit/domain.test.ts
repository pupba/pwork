import { describe, expect, it } from 'vitest'
import { assertWorkspace, docPath, editRestriction, label, makeDoc, makeWorkspace, newId, pathKey, readMarkdown, relativeUrl, repairMovedLinks, resolveLocal, toMarkdownFile } from '../../src/domain'
import { searchDocs } from '../../src/workspace'

describe('portable Markdown', () => {
  it('keeps UTF-8 text, title, times and tags', () => {
    const doc = makeDoc({ projectId: newId(), folderId: null }, '한글 실험: #1', '# 내용\n\n![시료](assets/사진.png)\n')
    doc.tags = ['산화 억제', 'R&D']
    const result = readMarkdown(toMarkdownFile(doc))
    expect(result).toMatchObject({ body: doc.markdown, title: doc.title, id: doc.id, createdAt: doc.createdAt, updatedAt: doc.updatedAt, tags: doc.tags })
  })
  it('rejects unsupported schema, malformed YAML and invalid labels', () => {
    expect(() => assertWorkspace({ ...makeWorkspace('검증'), version: 2 as 1 })).toThrow()
    expect(() => readMarkdown('---\ntitle: [\n---\n문서')).toThrow()
    expect(() => readMarkdown('---\nref: &a [1]\ntitle: *a\n---\n문서')).toThrow()
    expect(() => label('   ')).toThrow()
  })
  it('guards project paths and resolves in-project relative links', () => {
    for (const path of ['../outside.md','/root.md','C:/root.md','parent///test.md','A/CON.md','A/link\\temp.md']) expect(() => pathKey(path)).toThrow()
    expect(resolveLocal('Projects/한글/notes/test.md', '../assets/%EC%82%AC%EC%A7%84.png')).toBe('projects/한글/assets/사진.png')
    expect(resolveLocal('a/test.md', '../../../outside.png')).toBeNull()
    expect(resolveLocal('a/test.md', 'https://example.com/image.png')).toBeNull()
  })
  it('preserves raw and unsupported syntax by requiring source mode', () => {
    expect(editRestriction('# 제목\n\n<!-- 메모 -->')).toMatch(/원문/)
    expect(editRestriction('[링크][abc]\n\n[abc]: ./memo.md')).toMatch(/원문/)
    expect(editRestriction('## 제목\n\n- [x] 태스크')).toBe('')
  })
  it('supports Korean substring search and subtree paths', () => {
    const w = makeWorkspace('검증')
    const p = { id: newId(), name: '연구', archived: false, trashed: false }
    const f = { id: newId(), name: '실험', parentId: null, projectId: p.id, trashed: false }
    const doc = makeDoc({ projectId: p.id, folderId: f.id }, '안정성', '아보카도오일 산화억제를 실험했다.')
    expect(searchDocs({ ...w, projects: [p], folders: [f], docs: [doc] }, '산화억제', [doc])[0]).toMatchObject({ path: '연구 / 실험', doc })
  })
  it('preserves a relative document link when the target moves across folders', () => {
    const w = makeWorkspace('검증')
    const p = { id: newId(), name: '연구', archived: false, trashed: false }
    const f = { id: newId(), name: '실험', parentId: null, projectId: p.id, trashed: false }
    const origin = makeDoc({ projectId: p.id, folderId: null }, '원본')
    const target = makeDoc({ projectId: p.id, folderId: f.id }, '사진 색인')
    w.projects = [p]; w.folders = [f]; w.docs = [origin, target]
    origin.markdown = '[대상](' + relativeUrl(docPath(w, origin), docPath(w, target)) + '#heading)'
    const moved = { ...target, folderId: null }
    const result = repairMovedLinks(w, { ...w, docs: [origin, moved] })
    expect(result.docs[0].markdown).toBe('[대상](' + encodeURIComponent(moved.filename) + '#heading)')
  })
  it('measures Korean text search across 1,000 synthetic documents', () => {
    const w = makeWorkspace('검증')
    const p = { id: newId(), name: '검색 부하', archived: false, trashed: false }
    w.projects = [p]
    w.docs = Array.from({length:1000}, (_, index) => makeDoc({ projectId:p.id, folderId:null }, '문서 '+index,
      '합성 연구 데이터와 날짜, 판독 결과를 기록했습니다. '.repeat(100) + (index === 555 ? '한국어 포함 검색어' : '')))
    const times = Array.from({length:15}, () => {
      const start = performance.now()
      const hits = searchDocs(w, '한국어 포함 검색어', w.docs)
      const elapsed = performance.now() - start
      expect(hits).toHaveLength(1)
      return elapsed
    }).sort((a,b) => a-b)
    console.log('Korean substring search, 1,000 docs: median=' + times[7].toFixed(2) + 'ms, max=' + times.at(-1)!.toFixed(2) + 'ms')
    expect(times[7]).toBeLessThan(300)
  })
})

