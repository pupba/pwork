import { useEffect, useRef, useState } from 'react'
import { freshRevision, type Repository } from './repository'
import { folderChain, MAX_TEXT, message, now, repairMovedLinks, sameName, textSize, type Doc, type Folder, type Selection, type Upload, type Workspace } from './domain'

type Draft = { markdown: string; title: string; baseline: string }
type Mutation = (state: Workspace) => { next: Workspace; uploads?: Upload[] }
const draftKey = (workspaceId: string, docId: string) => 'prestique-draft:' + workspaceId + '/' + docId
const backupDraft = (workspaceId: string, docId: string, draft: Draft) => { try { localStorage.setItem(draftKey(workspaceId, docId), JSON.stringify(draft)); return true } catch { return false } }
const clearDraft = (workspaceId: string, docId: string) => { try { localStorage.removeItem(draftKey(workspaceId, docId)) } catch {} }
export const baseline = (doc: Doc) => doc.updatedAt + '|' + doc.title
export function restoredDraft(id: string, doc: Doc): Draft | null {
  try {
    const stored = JSON.parse(localStorage.getItem(draftKey(id, doc.id)) ?? 'null')
    if (stored && typeof stored.markdown === 'string' && typeof stored.title === 'string' && typeof stored.baseline === 'string') return stored
  } catch {}
  return null
}
export function useWorkspace(repo: Repository, initial: Workspace) {
  const [state, setState] = useState(initial)
  const current = useRef(initial)
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const channel = useRef<BroadcastChannel | null>(null)
  useEffect(() => {
    if (repo.kind === 'web' && typeof BroadcastChannel !== 'undefined') {
      channel.current = new BroadcastChannel('prestique-workspaces')
      return () => { channel.current?.close(); channel.current = null }
    }
  }, [repo])
  const run = <T,>(task: () => Promise<T>): Promise<T> => {
    const operation = queue.current.then(task)
    queue.current = operation.catch(() => {})
    return operation
  }
  const commit = (mutation: Mutation) => run(async () => {
    const previous = current.current
    const { next: data, uploads = [] } = mutation(previous)
    if (previous === data) return previous
    const next = freshRevision(repairMovedLinks(previous, data))
    await repo.save(previous, next, uploads)
    current.current = next
    setState(next)
    channel.current?.postMessage(next.id)
    return next
  })
  const reload = () => run(async () => {
    const next = await repo.open(repo.kind === 'web' ? current.current.id : undefined)
    if (!next) throw Error('작업공간을 다시 열 수 없습니다.')
    if (next.id !== current.current.id) throw Error('열린 작업공간이 변경되었습니다.')
    const old = current.current
    const same = next.revision === old.revision && next.docs.length === old.docs.length && next.docs.every((doc, index) => {
      const before = old.docs[index]
      return doc.markdown === before.markdown && doc.title === before.title && doc.tags.join('\n') === before.tags.join('\n')
    })
    if (!same) { current.current = next; setState(next) }
    else if (repo.kind === 'desktop') current.current = next
    return next
  })
  return { state, current, commit, reload, channel }
}
export function useDraft(workspace: Workspace, doc: Doc | undefined, save: (doc: Doc, draft: Draft) => Promise<Workspace>, delay: number) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [status, setStatus] = useState<'clean' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict'>('clean')
  const [error, setError] = useState('')
  const [restored, setRestored] = useState(false)
  const live = useRef<Draft | null>(null)
  const selected = useRef(doc)
  const auto = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const ongoing = useRef<Promise<void> | null>(null)
  const blocked = useRef(false)
  const handler = useRef(save)
  const epoch = useRef(0)
  handler.current = save
  selected.current = doc

  useEffect(() => {
    clearTimeout(auto.current)
    epoch.current++
    blocked.current = false
    const recovered = doc ? restoredDraft(workspace.id, doc) : null
    if (recovered && doc && recovered.title === doc.title && recovered.markdown === doc.markdown) {
      clearDraft(workspace.id, doc.id)
      live.current = null; setDraft(null); setStatus('clean'); setRestored(false); setError('')
      return
    }
    live.current = recovered
    setDraft(recovered); setStatus(recovered ? 'dirty' : 'clean'); setRestored(!!recovered); setError('')
    if (recovered && doc && recovered.baseline !== baseline(doc)) conflict('복구 초안과 현재 저장된 문서 사이에 변경이 있습니다.')
    return () => { clearTimeout(auto.current) }
  }, [workspace.id, doc?.id])

  function conflict(reason: string) {
    clearTimeout(auto.current); blocked.current = true; setStatus('conflict'); setError(reason)
  }
  async function flush(retry = false): Promise<void> {
    clearTimeout(auto.current)
    if (ongoing.current) await ongoing.current
    const target = selected.current
    const text = live.current
    const session = epoch.current
    if (!text || !target) return
    if (blocked.current && !retry) throw Error('저장 충돌을 먼저 해결하세요.')
    if (textSize(text.markdown) > MAX_TEXT - 65536) {
      setStatus('error'); setError('문서가 최대 크기를 초과했습니다. Markdown 다운로드로 내용을 보관할 수 있습니다.')
      throw Error('문서가 최대 크기를 초과했습니다.')
    }
    setStatus('saving')
    setError('')
    const pending = (async () => {
      try {
        const next = await handler.current(target, text)
        if (session !== epoch.current) return
        const saved = next.docs.find(item => item.id === target.id)
        if (!saved) throw Error('저장된 문서를 확인할 수 없습니다.')
        if (live.current === text) {
          live.current = null; setDraft(null); clearDraft(workspace.id, target.id); setStatus('saved'); setRestored(false)
        } else if (live.current) {
          const revised = { ...live.current, baseline: baseline(saved) }
          live.current = revised; setDraft(revised); backupDraft(workspace.id, target.id, revised); setStatus('dirty')
        }
      } catch (err) {
        if (session === epoch.current) {
          const reason = message(err)
          if (reason.startsWith('충돌:')) conflict(reason)
          else { setError(reason); setStatus('error') }
        }
        throw err
      }
    })()
    ongoing.current = pending
    try { await pending } finally { if (ongoing.current === pending) ongoing.current = null }
  }
  const flushRef = useRef(flush)
  flushRef.current = flush
  useEffect(() => {
    const exit = () => {
      const target = selected.current
      if (target && live.current) backupDraft(workspace.id, target.id, live.current)
      void flushRef.current().catch(() => {})
    }
    const visibility = () => { if (document.visibilityState === 'hidden') exit() }
    window.addEventListener('pagehide', exit); document.addEventListener('visibilitychange', visibility)
    return () => { window.removeEventListener('pagehide', exit); document.removeEventListener('visibilitychange', visibility) }
  }, [workspace.id])
  function change(field: 'markdown' | 'title', value: string) {
    if (!doc) return
    const next = { ...(live.current ?? { markdown: doc.markdown, title: doc.title, baseline: baseline(doc) }), [field]: value }
    live.current = next; setDraft(next)
    const backedUp = backupDraft(workspace.id, doc.id, next)
    if (blocked.current) return
    setStatus(ongoing.current ? 'saving' : 'dirty')
    setError(backedUp ? '' : '초안 복구용 저장 공간이 부족합니다.')
    clearTimeout(auto.current)
    auto.current = setTimeout(() => { void flushRef.current().catch(() => {}) }, delay)
  }
  function discard() {
    clearTimeout(auto.current)
    if (doc) clearDraft(workspace.id, doc.id)
    live.current = null; blocked.current = false; setDraft(null); setError(''); setRestored(false); setStatus('clean')
  }
  return { draft, live, status, error, change, flush, conflict, discard, restored, baseline }
}

export function ensureFolderName(state: Workspace, selection: Selection, name: string, except?: string) {
  if (state.folders.some(f => f.id !== except && f.projectId === selection.projectId && f.parentId === selection.folderId && !f.trashed && sameName(f.name, name))) throw Error('이 위치에 같은 이름의 폴더가 있습니다.')
}
export function ensureDestination(state: Workspace, place: Selection, folder?: Folder) {
  if (!state.projects.some(p => p.id === place.projectId && !p.trashed && !p.archived)) throw Error('대상 프로젝트를 사용할 수 없습니다.')
  const chain = folderChain(state, place.folderId)
  if (chain.some(f => f.trashed || f.projectId !== place.projectId || f.id === folder?.id)) throw Error('이 위치로 이동할 수 없습니다.')
  if (folder && folder.projectId !== place.projectId) throw Error('폴더는 같은 프로젝트 안에서 이동할 수 있습니다.')
}
export function searchDocs(state: Workspace, query: string, docs: Doc[]) {
  const term = query.trim().normalize('NFC').toLowerCase()
  if (!term) return []
  return docs.flatMap(doc => {
    const body = doc.markdown.normalize('NFC')
    const index = body.toLowerCase().indexOf(term)
    if (!doc.title.normalize('NFC').toLowerCase().includes(term) && index < 0) return []
    return [{ doc, path: [state.projects.find(p => p.id === doc.projectId)?.name, ...folderChain(state, doc.folderId).map(folder => folder.name)].filter(Boolean).join(' / '),
      text: index >= 0 ? (index > 32 ? '…' : '') + body.slice(Math.max(0, index - 32), index + 100).replace(/\s+/g, ' ') : '' }]
  }).slice(0, 150)
}
export const touchDoc = (doc: Doc, changes: Partial<Doc>) => ({ ...doc, ...changes, updatedAt: now() })

