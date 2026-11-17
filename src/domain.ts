import { parseDocument } from 'yaml'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'

export interface Project { id: string; name: string; archived: boolean; trashed: boolean }
export interface Folder { id: string; projectId: string; parentId: string | null; name: string; trashed: boolean }
export interface Asset { id: string; name: string; filename: string; mime: string; size: number }
export interface Doc {
  id: string; projectId: string; folderId: string | null; title: string; filename: string
  markdown: string; createdAt: string; updatedAt: string; tags: string[]; trashed: boolean
  assets: Asset[]
}
export interface Workspace {
  version: 1; id: string; name: string; revision: string
  projects: Project[]; folders: Folder[]; docs: Doc[]
}
export interface Upload { asset: Asset; blob: Blob }
export interface Selection { projectId: string; folderId: string | null }

export const newId = () => crypto.randomUUID()
export const isId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
export const now = () => new Date().toISOString()
export const MAX_TEXT = 4 * 1024 * 1024
export const MAX_ASSET = 24 * 1024 * 1024
export const MAX_ARCHIVE = 192 * 1024 * 1024
export const MAX_ENTRIES = 3000
const encoder = new TextEncoder()
export const decodeText = (bytes: ArrayBuffer | Uint8Array) => new TextDecoder('utf-8', { fatal: true }).decode(bytes)
export const textSize = (text: string) => encoder.encode(text).byteLength
export const message = (err: unknown) => err instanceof Error ? err.message : String(err)
export const sha256 = async (value: string | Blob) => {
  const bytes = typeof value === 'string' ? encoder.encode(value) : await value.arrayBuffer()
  const result = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, '0')).join('')
}
export function safeName(name: string, fallback = '제목 없음') {
  const cleaned = Array.from(name.normalize('NFC').replace(/[<>:"/\\|?*#%\u0000-\u001f]/g, ' ').trim()).slice(0, 62).join('').replace(/[. ]+$/, '')
  return !cleaned || /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(cleaned) ? fallback : cleaned
}
export function label(name: string) {
  const result = name.normalize('NFC').trim()
  if (!result || Array.from(result).length > 100 || /[\u0000-\u001f]/.test(result)) throw Error('이름을 1~100자로 입력하세요.')
  return result
}
export const sameName = (a: string, b: string) => a.normalize('NFC').toLowerCase() === b.normalize('NFC').toLowerCase()
export function makeWorkspace(name: string): Workspace {
  return { version: 1, id: newId(), name: label(name), revision: newId(), projects: [], folders: [], docs: [] }
}
export function makeDoc(place: Selection, title: string, markdown = ''): Doc {
  const id = newId()
  return { ...place, id, title: label(title), filename: safeName(title) + '-' + id.slice(0, 8) + '.md', markdown, createdAt: now(), updatedAt: now(), tags: [], trashed: false, assets: [] }
}
export function folderChain(state: Workspace, folderId: string | null): Folder[] {
  const result: Folder[] = []
  const seen = new Set<string>()
  while (folderId) {
    if (seen.has(folderId)) throw Error('폴더 경로가 순환합니다.')
    seen.add(folderId)
    const folder = state.folders.find(item => item.id === folderId)
    if (!folder) throw Error('폴더를 찾을 수 없습니다.')
    result.unshift(folder)
    folderId = folder.parentId
  }
  return result
}
export const isTrashed = (state: Workspace, doc: Doc) => doc.trashed || !!state.projects.find(p => p.id === doc.projectId)?.trashed || folderChain(state, doc.folderId).some(f => f.trashed)
const dir = (name: string, id: string) => safeName(name) + '-' + id.slice(0, 8)
export function projectPath(state: Workspace, id: string) {
  const project = state.projects.find(item => item.id === id)
  if (!project) throw Error('프로젝트를 찾을 수 없습니다.')
  return (project.trashed ? '.trash/' : 'Projects/') + dir(project.name, id)
}
export function folderPath(state: Workspace, projectId: string, folderId: string | null) {
  let result = projectPath(state, projectId)
  for (const folder of folderChain(state, folderId)) {
    if (folder.trashed) result = '.trash/' + projectId
    result += '/' + dir(folder.name, folder.id)
  }
  return result
}
export function docPath(state: Workspace, doc: Doc) {
  const parent = doc.trashed ? '.trash/' + doc.projectId + '/' + doc.id : folderPath(state, doc.projectId, doc.folderId)
  return parent + '/' + doc.filename
}
export function assetPath(state: Workspace, doc: Doc, asset: Asset) {
  const file = docPath(state, doc)
  return file.slice(0, file.lastIndexOf('/') + 1) + 'assets/' + asset.filename
}
export const assetUrl = (asset: Asset) => 'assets/' + asset.filename
export const basename = (path: string) => path.split('/').at(-1)!
export const dirname = (path: string) => path.split('/').slice(0, -1).join('/')
export function pathKey(raw: string) {
  const path = raw.normalize('NFC')
  if (!path || path.length > 3072 || path.includes('\\') || /^[A-Za-z]:/.test(path)) throw Error('지원하지 않는 파일 경로입니다.')
  for (const segment of path.split('/')) {
    if (!segment || segment === '.' || segment === '..' || /[<>:"|?*\u0000-\u001f]|[ .]$/.test(segment)
      || /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(segment)) throw Error('지원하지 않는 파일 경로입니다.')
  }
  return path.toLowerCase()
}
export function resolveLocal(source: string, url: string) {
  try {
    const decoded = decodeURIComponent(url.split(/[?#]/, 1)[0]).normalize('NFC')
    if (!decoded || decoded.startsWith('/') || /[:\\]/.test(decoded)) return null
    const parts = dirname(source).split('/').filter(Boolean)
    for (const part of decoded.split('/')) {
      if (part === '..') { if (!parts.length) return null; parts.pop() }
      else if (part && part !== '.') parts.push(part)
    }
    return pathKey(parts.join('/'))
  } catch { return null }
}
export function toMarkdownFile(doc: Doc) {
  const fields = {
    prestique_id: doc.id, title: doc.title, created_at: doc.createdAt,
    updated_at: doc.updatedAt, status: doc.trashed ? 'trash' : 'active', tags: doc.tags,
  }
  return '---\n' + Object.entries(fields).map(([name, value]) => name + ': ' + JSON.stringify(value)).join('\n') + '\n---\n\n' + doc.markdown
}
export function readMarkdown(source: string) {
  if (textSize(source) > MAX_TEXT) throw Error('Markdown 파일은 4 MiB 이하만 지원합니다.')
  const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source)
  if (!header) return { body: source }
  if (textSize(header[1]) > 65536) throw Error('Markdown 메타데이터가 너무 큽니다.')
  const parsed = parseDocument(header[1], { schema: 'core', uniqueKeys: true, strict: true })
  if (parsed.errors.length) throw Error('Markdown YAML 메타데이터 형식을 확인하세요.')
  const meta = parsed.toJS({ maxAliasCount: 0 }) as Record<string, unknown> | null
  if (meta && typeof meta !== 'object') return { body: source }
  const title = typeof meta?.title === 'string' ? meta.title : undefined
  const tags = Array.isArray(meta?.tags) ? meta.tags.filter((v): v is string => typeof v === 'string') : undefined
  const date = (value: unknown) => typeof value === 'string' && !isNaN(Date.parse(value)) ? new Date(value).toISOString() : undefined
  const unknown = meta ? Object.keys(meta).filter(key => !['prestique_id','title','created_at','updated_at','status','tags'].includes(key)) : []
  return { body: source.slice(header[0].length).replace(/^\r?\n/, ''), title, tags, id: meta?.prestique_id, createdAt: date(meta?.created_at), updatedAt: date(meta?.updated_at), unknown }
}

export interface MarkdownNode {
  type: string; value?: string; url?: string; depth?: number; children?: MarkdownNode[]
  position?: { start: { offset?: number }; end: { offset?: number } }
}
const markdownParser = unified().use(remarkParse).use(remarkGfm)
export const markdownTree = (source: string) => markdownParser.parse(source) as MarkdownNode
export function visit(node: MarkdownNode, callback: (node: MarkdownNode) => void) {
  callback(node)
  for (const child of node.children ?? []) visit(child, callback)
}
export function nodeText(node: MarkdownNode): string {
  return node.value ?? (node.children ?? []).map(nodeText).join('')
}
export function editRestriction(source: string) {
  if (source.length > 425000 && textSize(source) > 1024 * 1024) return '1 MiB를 넘는 문서는 원문에서 편집하세요.'
  let blocked = ''
  visit(markdownTree(source), node => {
    if ((node.type === 'html' && !isSafeLineBreak(node.value)) || ['footnoteReference','footnoteDefinition','definition','imageReference','linkReference'].includes(node.type)) blocked = 'HTML·각주·참조형 링크가 있어 원문 편집이 적용됩니다.'
  })
  if (/^\s*\$\$|^\s*```(?:mermaid|math)\b/m.test(source)) blocked = '수식 또는 다이어그램은 원문에서 편집하세요.'
  return blocked
}
export const isSafeLineBreak = (value: string | undefined) => /^<br\s*\/?>$/i.test(value ?? '')
export function assertWorkspace(w: Workspace) {
  if (!w || w.version !== 1 || !isId(w.id) || !isId(w.revision) || !Array.isArray(w.projects) || !Array.isArray(w.folders) || !Array.isArray(w.docs)) throw Error('이 워크스페이스 형식은 열 수 없습니다.')
  label(w.name)
  const seen = new Set<string>()
  for (const item of [...w.projects, ...w.folders, ...w.docs]) {
    if (!isId(item.id) || seen.has(item.id)) throw Error('워크스페이스 식별자가 잘못되었습니다.')
    seen.add(item.id)
  }
  const paths = new Set<string>()
  for (const project of w.projects) label(project.name)
  const check = (projectId: string, folderId: string | null) => {
    if (!w.projects.some(p => p.id === projectId) || folderChain(w, folderId).some(f => f.projectId !== projectId)) throw Error('프로젝트 경로가 일치하지 않습니다.')
  }
  for (const folder of w.folders) { label(folder.name); check(folder.projectId, folder.id) }
  for (const doc of w.docs) {
    check(doc.projectId, doc.folderId)
    label(doc.title)
    if (basename(doc.filename) !== doc.filename || !/\.md$/i.test(doc.filename) || typeof doc.markdown !== 'string' || !Array.isArray(doc.assets) || !Array.isArray(doc.tags) || !doc.tags.every(tag => typeof tag === 'string')) throw Error('문서 메타데이터가 잘못되었습니다.')
    for (const raw of [docPath(w, doc), ...doc.assets.map(asset => assetPath(w, doc, asset))]) {
      const key = pathKey(raw)
      if (paths.has(key)) throw Error('동일한 파일 경로가 있습니다.')
      paths.add(key)
    }
    for (const asset of doc.assets) {
      if (!isId(asset.id) || seen.has(asset.id) || basename(asset.filename) !== asset.filename || !allowedTypes[asset.mime] || !Number.isInteger(asset.size) || asset.size <= 0 || asset.size > MAX_ASSET) throw Error('첨부 메타데이터가 잘못되었습니다.')
      seen.add(asset.id)
    }
  }
}
export const allowedTypes: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf' }
export function relativeUrl(from: string, to: string) {
  const left = dirname(from).split('/').filter(Boolean)
  const right = to.split('/')
  let same = 0
  while (same < left.length && same < right.length && left[same] === right[same]) same++
  return [...left.slice(same).map(() => '..'), ...right.slice(same).map(encodeURIComponent)].join('/')
}
export function rewriteDocumentLinks(markdown: string, source: string, destination: string, oldToNew: Map<string, string>) {
  const edits: { from: number; to: number; text: string }[] = []
  visit(markdownTree(markdown), node => {
    if ((node.type !== 'link' && node.type !== 'definition') || !node.url) return
    const local = resolveLocal(source, node.url)
    const target = local ? oldToNew.get(local) : undefined
    const start = node.position?.start.offset
    const end = node.position?.end.offset
    if (!target || start === undefined || end === undefined) return
    const original = markdown.slice(start, end)
    const offset = original.lastIndexOf(node.url)
    if (offset >= 0) {
      const suffixAt = node.url.search(/[?#]/)
      const text = relativeUrl(destination, target) + (suffixAt < 0 ? '' : node.url.slice(suffixAt))
      edits.push({ from: start + offset, to: start + offset + node.url.length, text })
    }
  })
  return edits.sort((a, b) => b.from - a.from).reduce((text, edit) => text.slice(0, edit.from) + edit.text + text.slice(edit.to), markdown)
}
export function repairMovedLinks(before: Workspace, after: Workspace) {
  const current = new Map(after.docs.map(doc => [doc.id, docPath(after, doc)]))
  const previous = new Map(before.docs.map(doc => [doc.id, docPath(before, doc)]))
  const map = new Map<string, string>()
  let changed = false
  for (const [id, path] of previous) {
    const target = current.get(id)
    if (target) { map.set(pathKey(path), target); changed ||= path !== target }
  }
  if (!changed) return after
  return { ...after, docs: after.docs.map(doc => {
    const old = previous.get(doc.id)
    if (!old) return doc
    const body = rewriteDocumentLinks(doc.markdown, old, current.get(doc.id)!, map)
    return body === doc.markdown ? doc : { ...doc, markdown: body, updatedAt: now() }
  }) }
}
export async function checkedBlob(blob: Blob) {
  if (!blob.size || blob.size > MAX_ASSET) throw Error('첨부 파일은 1바이트~24 MiB까지 지원합니다.')
  const bytes = Array.from(new Uint8Array(await blob.slice(0, 16).arrayBuffer()))
  const ascii = (offset: number, count: number) => String.fromCharCode(...bytes.slice(offset, offset + count))
  let mime = ''
  if (bytes.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10') mime = 'image/png'
  else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) mime = 'image/jpeg'
  else if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') mime = 'image/webp'
  else if (['GIF87a','GIF89a'].includes(ascii(0, 6))) mime = 'image/gif'
  else if (ascii(0, 5) === '%PDF-') mime = 'application/pdf'
  if (!mime) throw Error('PNG, JPEG, WebP, GIF 및 PDF 첨부만 지원합니다.')
  return blob.slice(0, blob.size, mime)
}
export async function makeUpload(input: Blob, name: string, stripExif = false): Promise<Upload> {
  let blob = await checkedBlob(input)
  if (stripExif && blob.type.startsWith('image/')) {
    const bitmap = await createImageBitmap(blob)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width; canvas.height = bitmap.height
      const context = canvas.getContext('2d')
      if (!context) throw Error('이미지 변환을 시작할 수 없습니다.')
      context.drawImage(bitmap, 0, 0)
      const converted = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, blob.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.93))
      if (!converted) throw Error('이미지 메타데이터 제거에 실패했습니다.')
      blob = await checkedBlob(converted)
    } finally { bitmap.close() }
  }
  const id = newId()
  return { asset: { id, name: safeName(name, '첨부'), filename: id + '.' + allowedTypes[blob.type], mime: blob.type, size: blob.size }, blob }
}

