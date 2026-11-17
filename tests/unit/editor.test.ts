// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import { expect, it } from 'vitest'
import { editorExtensions } from '../../src/Editor'

it('round-trips the supported visual Markdown subset twice', () => {
  const fixture = [
    '# H1','## H2','### H3','#### H4','##### H5','###### H6',
    '**굵게** *기울임* ~~삭제~~ `inline`', '> 인용문', '- [x] 완료\n- [ ] 진행',
    '| Header | 값 |\n| --- | --- |\n| 문자 | 100 |',
    '| Next | 수치 |\n| --- | --- |\n| 가나 | 200 |',
    '[자료](./other.md)', '![대체텍스트](assets/a.png "사진 캡션")', '```js\nconst x = "한글"\n```',
  ].join('\n\n')
  const round = (md: string) => {
    const editor = new Editor({ element: null, extensions: editorExtensions(), contentType: 'markdown', content: md })
    try { return { md: editor.getMarkdown(), doc: editor.getJSON() } } finally { editor.destroy() }
  }
  const one = round(fixture)
  const two = round(one.md)
  const three = round(two.md)
  // Tiptap can introduce blank separator paragraphs between adjacent tables.
  const semantic = (doc: typeof one.doc) => ({ ...doc, content: doc.content?.filter(node => node.type !== 'paragraph' || node.content?.length) })
  expect(semantic(two.doc)).toEqual(semantic(one.doc))
  expect(semantic(three.doc)).toEqual(semantic(two.doc))
  for (const part of ['###### H6', '- [x] 완료', 'assets/a.png', './other.md', '사진 캡션', '100', '200', '```js', 'const x = "한글"']) expect(two.md).toContain(part)
})

