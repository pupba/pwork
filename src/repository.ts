import { openDB, type DBSchema } from 'idb'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { assertWorkspace, assetPath, docPath, folderPath, makeWorkspace, newId, projectPath, readMarkdown, toMarkdownFile, type Asset, type Upload, type Workspace } from './domain'

interface WorkspaceDb extends DBSchema {
  workspaces: { key: string; value: Workspace }
  assets: { key: string; value: Blob }
}
export interface WorkspaceRef { id: string; name: string }
export interface Repository {
  kind: 'web' | 'desktop'
  list(): Promise<WorkspaceRef[]>
  open(id?: string): Promise<Workspace | null>
  create(name: string): Promise<Workspace | null>
  save(previous: Workspace, next: Workspace, uploads: Upload[]): Promise<void>
  asset(state: Workspace, asset: Asset): Promise<Blob>
  hasExternalChanges?(): Promise<boolean>
  print(): Promise<void>
}
export class IndexedRepository implements Repository {
  kind = 'web' as const
  private db
  constructor(dbName = 'prestique-workspace-v1') {
    this.db = openDB<WorkspaceDb>(dbName, 1, {
      upgrade(db) { db.createObjectStore('workspaces', { keyPath: 'id' }); db.createObjectStore('assets') },
    })
  }
  async list() { return (await (await this.db).getAll('workspaces')).map(({ id, name }) => ({ id, name })) }
  async open(id?: string) {
    const db = await this.db
    const state = id ? await db.get('workspaces', id) : (await db.getAll('workspaces', undefined, 1))[0]
    if (state) assertWorkspace(state)
    return state ?? null
  }
  async create(name: string) {
    const workspace = makeWorkspace(name)
    const tx = (await this.db).transaction('workspaces', 'readwrite', { durability: 'strict' })
    await tx.store.add(workspace)
    await tx.done
    return workspace
  }
  async save(previous: Workspace, next: Workspace, uploads: Upload[]) {
    assertWorkspace(next)
    const tx = (await this.db).transaction(['workspaces','assets'], 'readwrite', { durability: 'strict' })
    try {
      const dbState = await tx.objectStore('workspaces').get(next.id)
      if (dbState?.revision !== previous.revision) throw Error('충돌: 이 작업공간이 다른 탭에서 변경되었습니다.')
      const assets = tx.objectStore('assets')
      const newAssets = new Set(next.docs.flatMap(doc => doc.assets.map(asset => asset.id)))
      const ops: Promise<unknown>[] = uploads.map(({ asset, blob }) => assets.add(blob, next.id + '/' + asset.id))
      for (const doc of previous.docs) for (const asset of doc.assets) if (!newAssets.has(asset.id)) ops.push(assets.delete(previous.id + '/' + asset.id))
      await Promise.all([...ops, tx.objectStore('workspaces').put(next), tx.done])
    } catch (error) {
      try { tx.abort() } catch { /* Transaction already closed */ }
      await tx.done.catch(() => {})
      throw error
    }
  }
  async asset(state: Workspace, asset: Asset) {
    const blob = await (await this.db).get('assets', state.id + '/' + asset.id)
    if (!blob) throw Error('첨부 파일을 찾을 수 없습니다.')
    return blob
  }
  async print() { window.print() }
}
type Catalog = Omit<Workspace, 'docs'> & { docs: Omit<Workspace['docs'][number], 'markdown'>[]; locations: Record<string, string> }
interface NativeDoc { path: string; text: string; hash: string }
interface NativeLoad { catalog: Catalog; documents: NativeDoc[]; stamp: string }
interface NativeWrite { path: string; text?: string; source?: string; base64?: string }
export function encodeBlob(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1])
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
export class DesktopRepository implements Repository {
  kind = 'desktop' as const
  private hashes = new WeakMap<Workspace, Map<string, string>>()
  private stamp = ''
  async list() { return [] }
  async open(id?: string) {
    const loaded = await invoke<NativeLoad | null>('workspace_open', { select: id === 'select' })
    return loaded ? this.hydrate(loaded) : null
  }
  async create(name: string) {
    const loaded = await invoke<NativeLoad | null>('workspace_create', { catalog: makeWorkspace(name) })
    return loaded ? this.hydrate(loaded) : null
  }
  private hydrate(loaded: NativeLoad) {
    const files = new Map(loaded.documents.map(file => [file.path, file]))
    const { locations: _locations, ...catalog } = loaded.catalog
    const w: Workspace = { ...catalog, docs: [] }
    w.docs = loaded.catalog.docs.map(doc => {
      const path = docPath(w, { ...doc, markdown: '' })
      const file = files.get(path)
      if (!file) throw Error('Markdown 파일이 이동되었거나 누락되었습니다. ' + path)
      const parsed = readMarkdown(file.text)
      return { ...doc, title: parsed.title ?? doc.title, tags: parsed.tags ?? doc.tags, markdown: parsed.body }
    })
    assertWorkspace(w)
    this.hashes.set(w, new Map(loaded.documents.map(data => [data.path, data.hash])))
    this.stamp = loaded.stamp
    return w
  }
  async hasExternalChanges() { return this.stamp !== await invoke<string>('workspace_stamp') }
  async save(previous: Workspace, next: Workspace, uploads: Upload[]) {
    assertWorkspace(next)
    const knownHashes = this.hashes.get(previous)
    if (!knownHashes) throw Error('작업공간을 다시 열어 주세요.')
    const writes: NativeWrite[] = []
    const removals: string[] = []
    const expect: Record<string, string> = {}
    const nextDocs = new Map(next.docs.map(doc => [doc.id, doc]))
    const previousDocs = new Map(previous.docs.map(doc => [doc.id, doc]))
    const newBlobs = new Map(uploads.map(upload => [upload.asset.id, upload.blob]))
    for (const doc of previous.docs) {
      const oldPath = docPath(previous, doc)
      const replacement = nextDocs.get(doc.id)
      if (!replacement || docPath(next, replacement) !== oldPath) removals.push(oldPath)
      for (const oldAsset of doc.assets) {
        const oldAssetPath = assetPath(previous, doc, oldAsset)
        const matching = replacement?.assets.find(asset => asset.id === oldAsset.id)
        if (!matching || !replacement || assetPath(next, replacement, matching) !== oldAssetPath) removals.push(oldAssetPath)
      }
    }
    for (const doc of next.docs) {
      const path = docPath(next, doc)
      const old = previousDocs.get(doc.id)
      const oldPath = old && docPath(previous, old)
      if (oldPath && (oldPath !== path || old !== doc)) expect[oldPath] = knownHashes.get(oldPath)!
      if (!old || old !== doc || oldPath !== path) writes.push({ path, text: toMarkdownFile(doc) })
      for (const asset of doc.assets) {
        const dest = assetPath(next, doc, asset)
        const upload = newBlobs.get(asset.id)
        const oldAsset = old?.assets.find(item => item.id === asset.id)
        if (upload) writes.push({ path: dest, base64: await encodeBlob(upload) })
        else if (oldAsset && old) {
          const source = assetPath(previous, old, oldAsset)
          if (source !== dest) writes.push({ path: dest, source })
        } else throw Error('첨부 저장 데이터가 없습니다.')
      }
    }
    for (const path of removals) if (knownHashes.has(path)) expect[path] = knownHashes.get(path)!
    const catalog: Catalog = {
      ...next, docs: next.docs.map(({ markdown: _markdown, ...doc }) => doc),
      locations: Object.fromEntries(next.docs.map(doc => [doc.id, docPath(next, doc)])),
    }
    const directories = [...new Set([
      ...next.projects.map(project => projectPath(next, project.id)),
      ...next.folders.map(folder => folderPath(next, folder.projectId, folder.id)),
    ])]
    const hashes = await invoke<Record<string, string>>('workspace_commit', { expected: previous.revision, catalog, writes, removals, expect, directories })
    const result = new Map(knownHashes)
    for (const path of removals) result.delete(path)
    for (const [path, hash] of Object.entries(hashes)) result.set(path, hash)
    this.hashes.set(next, result)
  }
  async asset(state: Workspace, asset: Asset) {
    const doc = state.docs.find(doc => doc.assets.some(item => item.id === asset.id))
    if (!doc) throw Error('첨부 파일을 찾을 수 없습니다.')
    const encoded = await invoke<string>('workspace_asset', { relative: assetPath(state, doc, asset), workspaceId: state.id })
    return new Blob([Uint8Array.from(atob(encoded), c => c.charCodeAt(0))], { type: asset.mime })
  }
  async print() { await invoke('workspace_print') }
}
export const freshRevision = (state: Workspace): Workspace => ({ ...state, revision: newId() })
export const createRepository = (): Repository => isTauri() ? new DesktopRepository() : new IndexedRepository()

