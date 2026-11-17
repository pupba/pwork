import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, useEditorState, type NodeViewProps } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import { TableKit } from '@tiptap/extension-table'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Image from '@tiptap/extension-image'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { Annotation, EditorState, Transaction } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown as cmMarkdown } from '@codemirror/lang-markdown'
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { Bold, Italic, Strikethrough, List, ListOrdered, ListChecks, Code, CodeXml, Quote, Link2, Table2, Undo2, Redo2, Minus, ImagePlus } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { assetUrl, editRestriction, isSafeLineBreak, markdownTree, nodeText, visit, type Asset, type Doc, type MarkdownNode, type Workspace } from './domain'
import type { Repository } from './repository'
import { saveDownload } from './archive'

const AssetContext = createContext<{ doc: Doc; state: Workspace; repo: Repository; openLink: (href: string) => void } | null>(null)
export const allowedLink = (value: string) => /^(https?:\/\/|mailto:|#)/i.test(value) || (!!value && !value.startsWith('/') && !/[\u0000-\u0020:]/.test(value.slice(0, value.indexOf('/') < 0 ? value.length : value.indexOf('/'))))
function useAsset(source: string) {
  const context = useContext(AssetContext)
  const asset = context?.doc.assets.find(item => assetUrl(item) === source)
  const repo = context?.repo
  const workspaceId = context?.state.id
  const stateRef = useRef(context?.state)
  stateRef.current = context?.state
  const [resolved, setResolved] = useState<{ id: string; url: string } | null>(null)
  const [broken, setBroken] = useState('')
  useEffect(() => {
    if (!asset || !repo || !stateRef.current) return
    let cancelled = false
    let objectUrl = ''
    repo.asset(stateRef.current, asset).then(blob => {
      if (cancelled) return
      objectUrl = URL.createObjectURL(blob)
      setResolved({ id: asset.id, url: objectUrl })
    }).catch(() => { if (!cancelled) setBroken(asset.id) })
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [asset?.id, asset?.filename, repo, workspaceId])
  return { asset, url: resolved?.id === asset?.id ? resolved?.url : undefined, broken: asset?.id === broken, context }
}
export function LocalImage({ source, alt, title }: { source: string; alt?: string; title?: string }) {
  const { asset, url, broken } = useAsset(source)
  if (!asset || broken) return <span className="image-fallback">{alt || '이미지'} · {source.startsWith('http') ? '외부 이미지' : '첨부를 찾을 수 없음'}</span>
  if (!url) return <span className="image-fallback">이미지 불러오는 중</span>
  return <span className="document-image"><img src={url} alt={alt ?? ''} /><span className="image-caption">{title}</span></span>
}
function AssetLink({ href, children }: { href: string; children: ReactNode }) {
  const { asset, context } = useAsset(href)
  if (asset && context) return <button className="text-action" onClick={() => {
    void context.repo.asset(context.state, asset).then(blob => saveDownload(blob, asset.name)).catch(error => alert(String(error)))
  }}>{children}</button>
  if (/^(https?:\/\/|mailto:)/i.test(href)) return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
  return <a href={href || '#'} onClick={event => { event.preventDefault(); if (href) context?.openLink(href) }}>{children}</a>
}
function ImageView({ node }: NodeViewProps) {
  return <NodeViewWrapper className="asset-node" data-drag-handle><LocalImage source={node.attrs.src} alt={node.attrs.alt} title={node.attrs.title} /></NodeViewWrapper>
}
export function editorExtensions() {
  return [
    StarterKit.configure({ link: { openOnClick: false, autolink: false, isAllowedUri: allowedLink } }),
    Markdown.configure({ markedOptions: { gfm: true } }),
    TableKit.configure({ table: { resizable: false } }),
    TaskList, TaskItem.configure({ nested: true }),
    Image.extend({ addNodeView() { return ReactNodeViewRenderer(ImageView) } }).configure({ inline: false, allowBase64: false }),
  ]
}
type Mode = 'visual' | 'source' | 'split' | 'preview'
export function DocumentPreview({ markdown, className = '' }: { markdown: string; className?: string }) {
  return <div className={'markdown-body ' + className}><ReactMarkdown
    skipHtml remarkPlugins={[remarkGfm, preserveSafeBreaks]}
    urlTransform={url => allowedLink(url) ? url : ''}
    components={{
      img: ({ src, alt, title }) => <LocalImage source={typeof src === 'string' ? src : ''} alt={alt} title={title} />,
      a: ({ href, children }) => <AssetLink href={href ?? ''}>{children}</AssetLink>,
    }}>{markdown}</ReactMarkdown></div>
}
function preserveSafeBreaks() {
  return (tree: MarkdownNode) => { visit(tree, node => { if (node.type === 'html' && isSafeLineBreak(node.value)) node.type = 'break' }) }
}
const externalUpdate = Annotation.define<boolean>()
function SourceEditor({ value, onChange }: { value: string; onChange: (text: string) => void }) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const change = useRef(onChange)
  change.current = onChange
  useEffect(() => {
    const editor = new EditorView({ parent: host.current!, state: EditorState.create({ doc: value, extensions: [
      lineNumbers(), history(), keymap.of([...defaultKeymap, ...historyKeymap]), cmMarkdown(), syntaxHighlighting(defaultHighlightStyle),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ 'aria-label': 'Markdown 원문 편집기', 'spellcheck': 'false' }),
      EditorView.updateListener.of(event => {
        if (event.docChanged && !event.transactions.some(transaction => transaction.annotation(externalUpdate))) change.current(event.state.doc.toString())
      }),
    ] }) })
    view.current = editor
    return () => { editor.destroy(); view.current = null }
  }, [])
  useEffect(() => {
    const editor = view.current
    if (editor && editor.state.doc.toString() !== value) editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: value },
      annotations: [externalUpdate.of(true), Transaction.addToHistory.of(false)],
    })
  }, [value])
  return <div ref={host} className="source-editor" />
}
function VisualEditor({ value, onChange, onFiles, onLink }: { value: string; onChange: (value: string) => void; onFiles: () => void; onLink: (setLink: (url: string) => void) => void }) {
  const change = useRef(onChange)
  change.current = onChange
  const lastText = useRef(value)
  const editor = useEditor({
    extensions: editorExtensions(), content: value, contentType: 'markdown', immediatelyRender: false,
    editorProps: { attributes: { class: 'visual-input markdown-body', 'aria-label': '시각적 문서 편집기', role: 'textbox', 'aria-multiline': 'true', spellcheck: 'true' } },
    onUpdate: ({ editor }) => {
      const update = editor.getMarkdown()
      lastText.current = update
      change.current(update)
    },
  })
  const marks = useEditorState({ editor, selector: ({ editor }) => editor ? {
    bold: editor.isActive('bold'), italic: editor.isActive('italic'), strike: editor.isActive('strike'), task: editor.isActive('taskList'),
    table: editor.isActive('table'), bullet: editor.isActive('bulletList'), ordered: editor.isActive('orderedList'), quote: editor.isActive('blockquote'),
    inline: editor.isActive('code'), code: editor.isActive('codeBlock'), heading: editor.getAttributes('heading').level as number | undefined,
  } : null })
  useEffect(() => {
    if (editor && lastText.current !== value) {
      lastText.current = value
      editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false })
    }
  }, [editor, value])
  if (!editor) return <div className="panel-message">편집기 준비 중</div>
  const tool = (label: string, icon: ReactNode, call: () => void, active?: boolean) =>
    <Button size="lg" className={'press tool ' + (active ? 'selected-tool' : '')} label={label} icon={icon} tooltip={label} isIconOnly variant="ghost" aria-pressed={active} onMouseDown={event => event.preventDefault()} onClick={call} />
  const run = () => editor.chain().focus()
  return <>
    <div className="format-toolbar" role="group" aria-label="문서 서식">
      <select aria-label="문단 및 제목 서식" value={marks?.heading ?? 0} onChange={e => {
        const level = Number(e.target.value) as 0 | 1 | 2 | 3 | 4 | 5 | 6
        if (level) run().setHeading({ level }).run()
        else run().setParagraph().run()
      }}><option value={0}>본문</option>{[1,2,3,4,5,6].map(level => <option key={level} value={level}>제목 {level}</option>)}</select>
      <span className="tool-divider" />
      {tool('굵게', <Bold size={16} />, () => run().toggleBold().run(), marks?.bold)}
      {tool('기울임', <Italic size={16} />, () => run().toggleItalic().run(), marks?.italic)}
      {tool('취소선', <Strikethrough size={16} />, () => run().toggleStrike().run(), marks?.strike)}
      {tool('글머리 목록', <List size={17} />, () => run().toggleBulletList().run(), marks?.bullet)}
      {tool('번호 목록', <ListOrdered size={17} />, () => run().toggleOrderedList().run(), marks?.ordered)}
      {tool('체크리스트', <ListChecks size={17} />, () => run().toggleTaskList().run(), marks?.task)}
      <span className="tool-divider" />
      {tool('인용문', <Quote size={16} />, () => run().toggleBlockquote().run(), marks?.quote)}
      {tool('인라인 코드', <Code size={17} />, () => run().toggleCode().run(), marks?.inline)}
      {tool('코드 블록', <CodeXml size={17} />, () => run().toggleCodeBlock().run(), marks?.code)}
      {tool('수평선', <Minus size={17} />, () => run().setHorizontalRule().run())}
      {tool('링크 삽입', <Link2 size={16} />, () => onLink(url => {
        if (allowedLink(url)) {
          if (editor.state.selection.empty) {
            run().insertContent({ type: 'text', text: url, marks: [{ type: 'link', attrs: { href: url } }] }).run()
          } else run().extendMarkRange('link').setLink({ href: url }).run()
        }
      }))}
      {tool('표 삽입', <Table2 size={16} />, () => run().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}
      {tool('파일 첨부', <ImagePlus size={17} />, onFiles)}
      <span className="tool-divider" />
      {tool('실행 취소', <Undo2 size={17} />, () => run().undo().run())}
      {tool('다시 실행', <Redo2 size={17} />, () => run().redo().run())}
    </div>
    {marks?.table && <div className="table-tools" aria-label="표 편집 명령">
      <Button label="행 추가" size="sm" onClick={() => run().addRowAfter().run()} />
      <Button label="행 삭제" size="sm" onClick={() => run().deleteRow().run()} />
      <Button label="열 추가" size="sm" onClick={() => run().addColumnAfter().run()} />
      <Button label="열 삭제" size="sm" onClick={() => run().deleteColumn().run()} />
      <Button label="표 삭제" size="sm" onClick={() => run().deleteTable().run()} />
    </div>}
    <EditorContent editor={editor} />
  </>
}
export interface DocumentEditorProps {
  doc: Doc; state: Workspace; repo: Repository; value: string; mode: Mode; onChange: (s: string) => void
  onFiles: () => void; onLink: (setLink: (url: string) => void) => void; openLink: (href: string) => void
  print: boolean; drag: boolean; onDrop: (files: File[]) => void; onPasteImage: (files: File[]) => void
}
export function DocumentEditor({ doc, state, repo, value, mode, onChange, onFiles, onLink, openLink, print, drag, onDrop, onPasteImage }: DocumentEditorProps) {
  const restriction = useMemo(() => mode === 'visual' ? editRestriction(value) : '', [value, mode])
  const context = useMemo(() => ({ doc, state, repo, openLink }), [doc, state, repo, openLink])
  return <AssetContext.Provider value={context}>
    <div className={'edit-surface ' + (drag ? 'drag-target' : '') + (mode === 'split' ? ' split-view' : '')}
      onDragOver={event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault() }}
      onDrop={event => { if (event.dataTransfer.files.length) { event.preventDefault(); onDrop(Array.from(event.dataTransfer.files)) } }}
      onPasteCapture={event => { if (event.clipboardData.files.length) { event.preventDefault(); onPasteImage(Array.from(event.clipboardData.files)) } }}>
      {restriction && <p className="editor-warning">{restriction}</p>}
      {mode === 'visual' && !restriction && <VisualEditor value={value} onChange={onChange} onFiles={onFiles} onLink={onLink} />}
      {(mode === 'source' || mode === 'split' || restriction) && <SourceEditor value={value} onChange={onChange} />}
      {(mode === 'preview' || mode === 'split') && <DocumentPreview markdown={value} />}
    </div>
    {print && <section className="print-output"><h1>{doc.title}</h1><DocumentPreview markdown={value} /></section>}
  </AssetContext.Provider>
}
export function outlineOf(markdown: string) {
  const headings: { title: string; level: number }[] = []
  visit(markdownTree(markdown), node => { if (node.type === 'heading') headings.push({ title: nodeText(node), level: node.depth ?? 1 }) })
  return headings
}
export function goToHeading(index: number) {
  const panel = document.querySelector('.edit-surface')
  const heading = panel?.querySelectorAll('h1,h2,h3,h4,h5,h6')[index]
  heading?.scrollIntoView({ block: 'start', behavior: 'instant' })
}

