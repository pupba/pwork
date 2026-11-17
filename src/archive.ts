import { BlobReader, BlobWriter, ZipReader, ZipWriter } from '@zip.js/zip.js'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { assetPath, assetUrl, assertWorkspace, basename, checkedBlob, decodeText, dirname, docPath, isId, label, makeDoc, makeUpload, makeWorkspace, markdownTree, MAX_ARCHIVE, MAX_ASSET, MAX_ENTRIES, MAX_TEXT, newId, pathKey, projectPath, readMarkdown, resolveLocal, rewriteDocumentLinks, sha256, toMarkdownFile, visit, type Doc, type Folder, type Project, type Upload, type Workspace } from './domain'
import { encodeBlob, type Repository } from './repository'

const archiveMetadata = '.prestique-project.json'
type AssetReader = (item: Doc['assets'][number]) => Promise<Blob>
const docType = /\.(?:md|markdown)$/i
const fileType = /\.(?:png|jpe?g|webp|gif|pdf)$/i

export async function unzipSecure(input: Blob) {
  if (!input.size || input.size > MAX_ARCHIVE) throw Error('ZIP은 최대 192 MiB까지 가져올 수 있습니다.')
  const reader = new ZipReader(new BlobReader(input), { useWebWorkers: false })
  const seen = new Set<string>()
  const files = new Map<string, { name: string; blob: Blob }>()
  let total = 0
  try {
    const entries = await reader.getEntries()
    if (entries.length > MAX_ENTRIES) throw Error('ZIP의 파일 수가 너무 많습니다.')
    for (const entry of entries) {
      const name = entry.directory ? entry.filename.replace(/\/$/, '') : entry.filename
      const key = pathKey(name)
      const mode = (entry.unixMode ?? 0) & 0o170000
      if (seen.has(key) || entry.encrypted || (mode && mode !== 0o040000 && mode !== 0o100000) || (mode === 0o040000 && !entry.directory)) throw Error('ZIP에 중복 경로, 특수 파일 또는 암호화 파일이 있습니다.')
      seen.add(key)
      if (entry.directory) continue
      if (key.split('/').some(part => part === '__macosx') || basename(key) === '.ds_store') continue
      if (!docType.test(key) && !fileType.test(key) && key !== archiveMetadata) throw Error('ZIP에 지원하지 않는 파일이 있습니다. ' + name)
      const max = fileType.test(key) ? MAX_ASSET : MAX_TEXT
      total += entry.uncompressedSize
      if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0 || entry.uncompressedSize > max || total > MAX_ARCHIVE ||
        (entry.uncompressedSize > 65536 && entry.uncompressedSize > Math.max(entry.compressedSize, 1) * 150)) throw Error('ZIP 압축 해제 용량 제한을 초과했습니다.')
    }
    for (const entry of entries) {
      if (entry.directory) continue
      const name = entry.filename.normalize('NFC')
      const key = pathKey(name)
      if (key.split('/').some(part => part === '__macosx') || basename(key) === '.ds_store') continue
      const chunks: Uint8Array<ArrayBuffer>[] = []
      let size = 0
      await entry.getData(new WritableStream<Uint8Array>({
        write(chunk) {
          size += chunk.byteLength
          if (size > entry.uncompressedSize) throw Error('ZIP의 압축 해제 크기가 일치하지 않습니다.')
          chunks.push(new Uint8Array(chunk))
        },
      }), { checkSignature: true, useWebWorkers: false })
      if (size !== entry.uncompressedSize) throw Error('ZIP 파일 데이터가 손상되었습니다.')
      files.set(key, { name, blob: new Blob(chunks) })
    }
    for (const key of files.keys()) {
      let parent = dirname(key)
      while (parent) {
        if (files.has(parent)) throw Error('ZIP에서 파일과 폴더 경로가 충돌합니다.')
        parent = dirname(parent)
      }
    }
    return files
  } finally { await reader.close() }
}
export async function makeProjectZip(state: Workspace, project: Project, repo: Pick<Repository, 'asset'>) {
  const docs = state.docs.filter(doc => doc.projectId === project.id)
  const folders = state.folders.filter(folder => folder.projectId === project.id)
  return writeZip({ ...state, projects: [project], folders, docs }, project, asset => repo.asset(state, asset))
}
async function writeZip(state: Workspace, project: Project, readAsset: AssetReader) {
  const entries = new Map<string, Blob>()
  const checksums: Record<string, string> = {}
  const base = projectPath(state, project.id) + '/'
  const relative = (path: string) => path.startsWith(base) ? path.slice(base.length) : '.prestique-trash/' + path.split('/').slice(1).join('/')
  const add = async (path: string, blob: Blob) => {
    const key = pathKey(path)
    if (Object.hasOwn(checksums, key)) throw Error('백업할 파일의 경로가 중복됩니다.')
    checksums[key] = await sha256(blob)
    entries.set(path, blob)
  }
  let total = 0
  for (const doc of state.docs) {
    await add(relative(docPath(state, doc)), new Blob([toMarkdownFile(doc)]))
    for (const asset of doc.assets) await add(relative(assetPath(state, doc, asset)), await readAsset(asset))
  }
  const metadata = {
    version: 1, project, folders: state.folders, checksums,
    docs: state.docs.map(doc => {
      const { markdown: _body, ...meta } = doc
      return { ...meta, file: relative(docPath(state, doc)), assetFiles: doc.assets.map(asset => relative(assetPath(state, doc, asset))) }
    }),
  }
  entries.set(archiveMetadata, new Blob([JSON.stringify(metadata)]))
  const writer = new ZipWriter(new BlobWriter('application/zip'), { useWebWorkers: false })
  for (const [name, blob] of entries) {
    total += blob.size
    if (total > MAX_ARCHIVE || entries.size > MAX_ENTRIES || (name === archiveMetadata && blob.size > MAX_TEXT)) throw Error('이 프로젝트는 ZIP 내보내기 한도를 초과했습니다.')
    await writer.add(name, new BlobReader(blob), { level: 0, useWebWorkers: false })
  }
  return writer.close()
}
export interface ImportedProject { project: Project; folders: Folder[]; docs: Doc[]; uploads: Upload[]; warnings: string[] }
type FileMap = Awaited<ReturnType<typeof unzipSecure>>
export async function importZip(input: Blob, title: string): Promise<ImportedProject> {
  return importFilesOrBackup(await unzipSecure(input), title)
}
async function importFilesOrBackup(files: FileMap, title: string): Promise<ImportedProject> {
  const record = files.get(archiveMetadata)
  if (!record) return importFiles(files, title)
  const backup = JSON.parse(decodeText(await record.blob.arrayBuffer()))
  if (backup.version !== 1 || !Array.isArray(backup.docs) || !Array.isArray(backup.folders) || !isId(backup.project?.id) ||
    !backup.checksums || files.size - 1 !== Object.keys(backup.checksums).length) throw Error('프로젝트 백업의 메타데이터가 잘못되었습니다.')
  for (const [key, file] of files) if (key !== archiveMetadata && await sha256(file.blob) !== backup.checksums[key]) throw Error('백업 파일의 무결성 검증에 실패했습니다. ' + file.name)
  const idMap = new Map<string, string>()
  const remap = (id: string) => {
    if (!isId(id)) throw Error('백업 식별자가 잘못되었습니다.')
    if (!idMap.has(id)) idMap.set(id, newId())
    return idMap.get(id)!
  }
  const project: Project = { id: remap(backup.project.id), name: label(backup.project.name), archived: !!backup.project.archived, trashed: false }
  const folders = backup.folders.map((f: Folder): Folder => ({ id: remap(f.id), projectId: project.id, parentId: f.parentId ? remap(f.parentId) : null, name: label(f.name), trashed: !!f.trashed }))
  const uploads: Upload[] = []
  const docs: Doc[] = []
  const used = new Set<string>()
  const get = (path: string) => {
    const key = pathKey(path)
    if (used.has(key) || key === archiveMetadata) throw Error('백업 참조 경로가 중복됩니다.')
    const blob = files.get(key)?.blob
    if (!blob) throw Error('백업 파일이 누락되었습니다. ' + path)
    used.add(key)
    return blob
  }
  for (const item of backup.docs) {
    const parsed = readMarkdown(decodeText(await get(item.file).arrayBuffer()))
    if (!Array.isArray(item.assets) || item.assets.length !== item.assetFiles?.length) throw Error('첨부 목록이 일치하지 않습니다.')
    const assets: Doc['assets'] = []
    for (const [index, data] of item.assets.entries()) {
      const blob = await checkedBlob(get(item.assetFiles[index]))
      if (blob.size !== data.size || blob.type !== data.mime) throw Error('첨부 메타데이터가 파일과 일치하지 않습니다.')
      const asset = { id: remap(data.id), name: label(data.name), filename: data.filename, mime: blob.type, size: blob.size }
      uploads.push({ asset, blob })
      assets.push(asset)
    }
    docs.push({ id: remap(item.id), projectId: project.id, folderId: item.folderId ? remap(item.folderId) : null, title: label(parsed.title ?? item.title), filename: item.filename, markdown: parsed.body,
      createdAt: parsed.createdAt ?? new Date().toISOString(), updatedAt: parsed.updatedAt ?? new Date().toISOString(), tags: parsed.tags ?? [], trashed: !!item.trashed, assets })
  }
  if (used.size !== files.size - 1) throw Error('백업에 연결되지 않은 파일이 있습니다.')
  const state = { ...makeWorkspace('검증'), projects: [project], folders, docs }
  assertWorkspace(state)
  rebaseImportedLinks(state, backup.docs.map((doc: { file: string }) => doc.file))
  return { project, folders, docs, uploads, warnings: [] }
}

export async function readDirectory(items: File[]) {
  const files: FileMap = new Map()
  const first = items[0]?.webkitRelativePath.split('/')[0] ?? ''
  let total = 0
  if (items.length > MAX_ENTRIES) throw Error('폴더의 파일 수가 너무 많습니다.')
  for (const file of items) {
    const name = (file.webkitRelativePath ? file.webkitRelativePath.split('/').slice(1).join('/') : file.name).normalize('NFC')
    const key = pathKey(name)
    if (!docType.test(key) && !fileType.test(key) && key !== archiveMetadata) continue
    total += file.size
    if (files.has(key) || total > MAX_ARCHIVE || file.size > (docType.test(key) ? MAX_TEXT : MAX_ASSET)) throw Error('폴더의 파일 경로 또는 용량을 확인하세요.')
    files.set(key, { name, blob: file })
  }
  return importFilesOrBackup(files, first || '가져온 프로젝트')
}
async function importFiles(files: FileMap, title: string): Promise<ImportedProject> {
  const project: Project = { id: newId(), name: label(title), archived: false, trashed: false }
  const folders: Folder[] = []
  const docs: Doc[] = []
  const uploads: Upload[] = []
  const warnings: string[] = []
  const originalPaths: string[] = []
  const folderMap = new Map<string, string>()
  const folderId = (file: string) => {
    let parentId: string | null = null
    let path = ''
    for (const name of dirname(file).split('/').filter(Boolean)) {
      path += name + '/'
      if (!folderMap.has(path.toLowerCase())) {
        const folder: Folder = { id: newId(), projectId: project.id, parentId, name: label(name), trashed: false }
        folders.push(folder); folderMap.set(path.toLowerCase(), folder.id)
      }
      parentId = folderMap.get(path.toLowerCase())!
    }
    return parentId
  }
  for (const [key, file] of files) {
    if (!docType.test(key)) continue
    const parsed = readMarkdown(decodeText(await file.blob.arrayBuffer()))
    const doc = makeDoc({ projectId: project.id, folderId: folderId(file.name) }, parsed.title || basename(file.name).replace(docType,''), parsed.body)
    doc.tags = parsed.tags ?? []
    if (parsed.createdAt) doc.createdAt = parsed.createdAt
    if (parsed.updatedAt) doc.updatedAt = parsed.updatedAt
    if (parsed.unknown?.length) warnings.push(doc.title + '의 추가 YAML 속성이 제외되었습니다.')
    const references: { url: string; from: number; to: number }[] = []
    visit(markdownTree(doc.markdown), node => {
      const from = node.position?.start.offset
      const to = node.position?.end.offset
      if ((node.type === 'image' || node.type === 'link' || node.type === 'definition') && node.url && from !== undefined && to !== undefined) references.push({ url: node.url, from, to })
    })
    const attached = new Map<string, Upload>()
    for (const { url, from, to } of references.sort((a, b) => b.from - a.from)) {
      if (/^(https?:|mailto:|#)/i.test(url)) continue
      const resolved = resolveLocal(file.name, url)
      const source = resolved && files.get(resolved)
      if (!resolved || !source) { warnings.push(doc.title + ' · 찾을 수 없는 상대경로 ' + url); continue }
      if (!fileType.test(resolved)) continue
      let upload = attached.get(resolved)
      if (!upload) {
        upload = await makeUpload(source.blob, basename(source.name))
        attached.set(resolved, upload)
        uploads.push(upload); doc.assets.push(upload.asset)
      }
      const original = doc.markdown.slice(from, to)
      const direct = original.lastIndexOf(url)
      if (direct < 0) { warnings.push(doc.title + ' · 첨부 링크 구문을 확인하세요. ' + url); continue }
      doc.markdown = doc.markdown.slice(0, from + direct) + assetUrl(upload.asset) + doc.markdown.slice(from + direct + url.length)
    }
    docs.push(doc)
    originalPaths.push(file.name)
  }
  if (!docs.length) throw Error('폴더 또는 ZIP에 Markdown 문서가 없습니다.')
  rebaseImportedLinks({ ...makeWorkspace('검증'), projects: [project], folders, docs }, originalPaths)
  return { project, folders, docs, uploads, warnings }
}
function rebaseImportedLinks(state: Workspace, originalPaths: string[]) {
  const map = new Map(state.docs.map((doc, i) => [pathKey(originalPaths[i]), docPath(state, doc)]))
  state.docs.forEach((doc, i) => {
    doc.markdown = rewriteDocumentLinks(doc.markdown, originalPaths[i], docPath(state, doc), map)
  })
}
export async function saveDownload(blob: Blob, filename: string) {
  if (isTauri()) return invoke<boolean>('workspace_export', { filename, base64: await encodeBlob(blob) })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url; link.download = filename
  document.body.append(link); link.click(); link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
  return true
}

