import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { Theme } from '@astryxdesign/core/theme'
import { neutralTheme } from '@astryxdesign/theme-neutral/built'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { Archive, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpToLine, Camera, Check, ChevronDown, ChevronRight, CircleAlert, CloudOff, FilePlus2, FileText, FolderClosed, FolderPlus, HardDrive, LoaderCircle, Menu, PanelRight, Plus, Printer, Search, Settings2, Trash2, X } from 'lucide-react'
import { Action, Brand, Confirm, Field, Modal, TextPrompt } from './ui'
import { createRepository, encodeBlob, type Repository } from './repository'
import { importZip, makeProjectZip, readDirectory, saveDownload, unzipSecure, type ImportedProject } from './archive'
import { allowedLink, DocumentEditor, goToHeading, outlineOf } from './Editor'
import { assetUrl, decodeText, docPath, folderChain, isTrashed, label, makeDoc, makeUpload, markdownTree, MAX_TEXT, message, newId, now, pathKey, readMarkdown, resolveLocal, safeName, sameName, toMarkdownFile, visit, type Asset, type Doc, type Folder, type Project, type Selection, type Upload, type Workspace } from './domain'
import { baseline, ensureDestination, ensureFolderName, searchDocs, touchDoc, useDraft, useWorkspace } from './workspace'

type Mode = 'visual' | 'source' | 'split' | 'preview'
type Prompt = { title: string; field: string; initial?: string; verb?: string; confirmed: (value: string) => void | Promise<void> }
type Confirmation = { title: string; description: string; verb: string; confirmed: () => Promise<void> }
type MoveTarget = { item: Doc; type: 'doc' } | { item: Folder; type: 'folder' }
type StoragePrefs = { theme: 'light' | 'dark' | 'system'; reduced: boolean; exif: boolean; delay: number }
const preferences: StoragePrefs = { theme: 'system', reduced: false, exif: false, delay: 760 }
const repo = createRepository()
const modes: Record<Mode, string> = { visual: '시각적 편집', source: 'Markdown', split: '분할 보기', preview: '미리보기' }
const statusText = { clean: '로컬 저장소', dirty: '저장 대기', saving: '저장 중', saved: '저장 완료', error: '저장 실패', conflict: '저장 충돌' }
function readSetting<T>(key: string, fallback: T): T {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback } catch { return fallback }
}
function setting<T>(key: string, value: T) { try { localStorage.setItem(key, JSON.stringify(value)) } catch {} }

export function App() {
  const [prefs, setPrefs] = useState(() => ({ ...preferences, ...readSetting('pw-preferences', preferences) }))
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [refs, setRefs] = useState<{ id: string; name: string }[]>([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [prompt, setPrompt] = useState(false)
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)
  const dark = prefs.theme === 'dark' || prefs.theme === 'system' && systemDark
  function changePrefs(next: StoragePrefs) { setPrefs(next); setting('pw-preferences', next) }
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const update = () => setSystemDark(mq.matches)
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    document.documentElement.dataset.motion = prefs.reduced ? 'reduce' : 'system'
  }, [dark, prefs.reduced])
  async function open(id?: string) {
    setBusy(true); setError('')
    try {
      const loaded = await repo.open(id)
      if (loaded) { setWorkspace(loaded); setting('pw-last-workspace', loaded.id) }
      setRefs(await repo.list())
    } catch (err) { setError(message(err)) }
    finally { setBusy(false) }
  }
  useEffect(() => { void open(repo.kind === 'web' ? readSetting('pw-last-workspace', undefined) : undefined) }, [])
  return <Theme theme={neutralTheme} mode={dark ? 'dark' : 'light'}>
    {workspace ? <WorkspaceView key={workspace.id} initial={workspace} repo={repo} prefs={prefs} changePrefs={changePrefs} leave={async () => {
      setRefs(await repo.list()); setWorkspace(null); setting('pw-last-workspace', null)
    }} /> :
      <main className="welcome">
        <header className="welcome-header"><Brand className="scene-brand" /><span>PRESTIQUE LABS</span></header>
        <section className="welcome-card">
          <div className="welcome-copy">
            <h1>Workspace</h1>
            <p>프로젝트, 연구노트, 첨부 파일을 한곳에서 관리하세요.</p>
            <span className="welcome-storage"><HardDrive size={15} />{repo.kind === 'desktop' ? '선택한 Windows 폴더에 저장' : '이 브라우저에 로컬 저장'}</span>
          </div>
          <div className="welcome-entry">
          <h2>작업공간 열기</h2>
          {busy && <p role="status" className="quiet"><LoaderCircle size={16} className="spin" /> 작업공간 확인 중</p>}
          {error && <p role="alert" className="failure-inline">{error}</p>}
          {!busy && <div className="welcome-actions">
            {refs.map(ref => <button className="workspace-entry press" key={ref.id} onClick={() => void open(ref.id)}><FolderClosed size={17} /><span>{ref.name}</span><ChevronRight size={16} /></button>)}
            <Action label="새 작업공간" icon={<Plus size={16} />} endContent={<ArrowRight size={16} />} variant="primary" onClick={() => setPrompt(true)} />
            {repo.kind === 'desktop' && <Action label="기존 폴더 선택" icon={<FolderClosed size={16} />} onClick={() => void open('select')} />}
          </div>}
          </div>
        </section>
      </main>}
    {prompt && <TextPrompt title="새 작업공간" field="작업공간 이름" initial="PRESTIQUE" verb="만들기" close={() => setPrompt(false)} confirmed={async name => {
      const created = await repo.create(name)
      if (created) { setWorkspace(created); setting('pw-last-workspace', created.id) }
    }} />}
  </Theme>
}

function WorkspaceView({ initial, repo, prefs, changePrefs, leave }: {
  initial: Workspace; repo: Repository; prefs: StoragePrefs; changePrefs: (next: StoragePrefs) => void; leave: () => Promise<void>
}) {
  const { state, current, commit, reload, channel } = useWorkspace(repo, initial)
  const [projectId, setProjectId] = useState(() => initial.projects.find(project => !project.trashed && !project.archived)?.id ?? '')
  const [folderId, setFolderId] = useState<string | null>(null)
  const [openId, setOpenId] = useState(() => readSetting('pw-doc:' + initial.id, ''))
  const [showNav, setShowNav] = useState(false)
  const [inspector, setInspector] = useState(false)
  const [view, setView] = useState<'projects' | 'trash' | 'archive'>('projects')
  const [mode, setMode] = useState<Mode>('visual')
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<'workspace' | 'project' | 'folder'>('workspace')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [quota, setQuota] = useState('')
  const [prompt, setPrompt] = useState<Prompt | null>(null)
  const [confirm, setConfirm] = useState<Confirmation | null>(null)
  const [move, setMove] = useState<MoveTarget | null>(null)
  const dragItem = useRef<MoveTarget | null>(null)
  const [dropKey, setDropKey] = useState('')
  const [print, setPrint] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [attaching, setAttaching] = useState(false)
  const [isOver, setIsOver] = useState(false)
  const [attachment, setAttachment] = useState<Asset | null>(null)
  const [showActions, setShowActions] = useState(false)
  const [showProjectActions, setShowProjectActions] = useState(false)
  const documentInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const navTrigger = useRef<HTMLButtonElement>(null)
  const navPanel = useRef<HTMLElement>(null)
  const doc = state.docs.find(item => item.id === openId && !isTrashed(state, item))
  const project = state.projects.find(item => item.id === projectId && !item.trashed)
  const place = { projectId, folderId }
  const draft = useDraft(state, doc, (target, text) => commit(w => {
    const actual = w.docs.find(item => item.id === target.id)
    if (!actual || isTrashed(w, actual) || baseline(actual) !== text.baseline || actual.markdown !== target.markdown) throw Error('충돌: 저장된 문서가 변경되었습니다.')
    const title = label(text.title)
    return { next: { ...w, docs: w.docs.map(item => item.id === actual.id ? touchDoc(item, { title, markdown: text.markdown }) : item) } }
  }), prefs.delay)
  const markdown = draft.draft?.markdown ?? doc?.markdown ?? ''
  const title = draft.draft?.title ?? doc?.title ?? ''
  const headings = useMemo(() => inspector && doc ? outlineOf(markdown) : [], [markdown, inspector, doc?.id])
  const availableDocs = useMemo(() => state.docs.filter(item => !isTrashed(state, item)), [state])
  const hits = useMemo(() => searchDocs(state, query, availableDocs.filter(item =>
    scope === 'workspace' || item.projectId === projectId && (scope !== 'folder' || !folderId || folderChain(state, item.folderId).some(folder => folder.id === folderId))
  )), [state, availableDocs, query, scope, projectId, folderId])
  const readOnly = !!doc && !!state.projects.find(p => p.id === doc.projectId)?.archived

  useEffect(() => {
    if (doc && openId) { setProjectId(doc.projectId); setFolderId(doc.folderId) }
  }, [openId, doc?.projectId, doc?.folderId])
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    addEventListener('online', update); addEventListener('offline', update)
    return () => { removeEventListener('online', update); removeEventListener('offline', update) }
  }, [])
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 4200)
    return () => clearTimeout(timer)
  }, [notice])
  const statusChanged = useRef<() => void>(() => {})
  statusChanged.current = () => {
    const old = doc
    void reload().then(next => {
      const changed = old && next.docs.find(item => item.id === old.id)
      if (draft.live.current && old && (!changed || changed.markdown !== old.markdown || changed.title !== old.title)) {
        draft.conflict('외부에서 문서가 변경되었습니다. 복구본을 저장하거나 외부 변경을 적용할 수 있습니다.')
      }
    }).catch(err => setError(message(err)))
  }
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    let checking = false
    let active = true
    const update = () => { clearTimeout(timer); timer = setTimeout(() => statusChanged.current(), 450) }
    const native = repo.kind === 'desktop' ? listen('workspace-files-changed', update) : null
    void native?.catch(() => {})
    const poll = repo.hasExternalChanges ? setInterval(async () => {
      if (document.hidden || checking) return
      checking = true
      try { if (await repo.hasExternalChanges!() && active) update() } catch (err) { if (active) setError(message(err)) }
      finally { checking = false }
    }, 1800) : undefined
    if (channel.current) channel.current.onmessage = event => { if (event.data === state.id) update() }
    window.addEventListener('focus', update)
    return () => {
      active = false; clearInterval(poll)
      clearTimeout(timer); window.removeEventListener('focus', update)
      if (native) void native.then(unlisten => unlisten()).catch(() => {})
    }
  }, [state.id, repo, channel])
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) {
        if (showNav) { setShowNav(false); navTrigger.current?.focus() }
        else if (!showActions && !showProjectActions) setInspector(false)
        setShowActions(false); setShowProjectActions(false)
      }
      if (!(event.metaKey || event.ctrlKey) || event.isComposing) return
      if (event.key.toLowerCase() === 's') { event.preventDefault(); void draft.flush().catch(() => {}) }
      if (event.key.toLowerCase() === 'k') { event.preventDefault(); searchInput.current?.focus() }
    }
    window.addEventListener('keydown', keyboard)
    return () => window.removeEventListener('keydown', keyboard)
  }, [draft.flush, showNav, showActions, showProjectActions])
  useEffect(() => { if (showNav) navPanel.current?.querySelector('button')?.focus() }, [showNav])

  function perform(task: () => Promise<unknown>) {
    setError('')
    void task().catch(err => setError(message(err)))
  }
  function pick(id: string) {
    setOpenId(id); setting('pw-doc:' + state.id, id); setMode('visual'); setShowActions(false)
  }
  async function openDoc(item: Doc) {
    if (item.id !== openId) await draft.flush()
    setProjectId(item.projectId); setFolderId(item.folderId); pick(item.id); setQuery(''); setShowNav(false); setView('projects')
  }
  async function selectLocation(id: string, folder: string | null) {
    await draft.flush(); pick(''); setProjectId(id); setFolderId(folder); setView('projects'); setShowProjectActions(false)
  }
  async function newProject(name: string) {
    await draft.flush()
    const clean = label(name)
    const newProject = { id: newId(), name: clean, archived: false, trashed: false }
    await commit(w => {
      if (w.projects.some(p => !p.trashed && sameName(p.name, clean))) throw Error('같은 이름의 프로젝트가 있습니다.')
      return { next: { ...w, projects: [...w.projects, newProject] } }
    })
    await selectLocation(newProject.id, null)
    setShowNav(false)
  }
  const createProject = () => setPrompt({ title: '새 프로젝트', field: '프로젝트 이름', verb: '만들기', confirmed: newProject })
  const createFolder = () => setPrompt({ title: '새 폴더', field: '폴더 이름', verb: '만들기', confirmed: async name => {
    await draft.flush()
    const folder: Folder = { id: newId(), projectId, parentId: folderId, name: label(name), trashed: false }
    await commit(w => {
      ensureDestination(w, place); ensureFolderName(w, place, folder.name)
      return { next: { ...w, folders: [...w.folders, folder] } }
    })
    await selectLocation(projectId, folder.id)
  } })
  const newDocument = () => setPrompt({ title: '새 문서', field: '문서 제목', initial: '제목 없음', verb: '만들기', confirmed: async name => {
    await draft.flush()
    const created = makeDoc(place, name)
    await commit(w => { ensureDestination(w, place); return { next: { ...w, docs: [...w.docs, created] } } })
    await openDoc(created)
  } })
  async function projectChange(item: Project, changes: Partial<Project>) {
    await draft.flush()
    await commit(w => {
      if (changes.name && w.projects.some(other => other.id !== item.id && !other.trashed && sameName(other.name, changes.name!))) throw Error('같은 이름의 프로젝트가 있습니다.')
      const restoring = item.trashed && changes.trashed === false
      const occupied = restoring && w.projects.some(other => other.id !== item.id && !other.trashed && sameName(other.name, item.name))
      let name = occupied ? item.name.slice(0, 81) + ' · 복원 ' + item.id.slice(0, 6) : item.name
      name = changes.name ?? name
      return { next: { ...w, projects: w.projects.map(p => p.id === item.id ? { ...p, ...changes, name } : p) } }
    })
    if (changes.trashed || changes.archived) { pick(''); setProjectId(''); setFolderId(null) }
    setShowProjectActions(false)
  }
  async function folderChange(item: Folder, changes: Partial<Folder>) {
    await draft.flush()
    await commit(w => {
      const actual = w.folders.find(folder => folder.id === item.id)
      if (!actual) throw Error('이 폴더를 찾을 수 없습니다.')
      const candidate = { ...actual, ...changes }
      if (!candidate.trashed) {
        const target = { projectId: candidate.projectId, folderId: candidate.parentId }
        ensureDestination(w, target, actual)
        const occupied = w.folders.some(folder => folder.id !== item.id && folder.projectId === target.projectId && folder.parentId === target.folderId && !folder.trashed && sameName(folder.name, candidate.name))
        if (occupied && actual.trashed) candidate.name = candidate.name.slice(0, 80) + ' · 복원 ' + item.id.slice(0, 6)
        ensureFolderName(w, target, candidate.name, item.id)
      }
      return { next: { ...w, folders: w.folders.map(folder => folder.id === item.id ? candidate : folder) } }
    })
    if (changes.trashed) await selectLocation(item.projectId, item.parentId)
  }
  async function docChange(item: Doc, changes: Partial<Doc>) {
    await draft.flush()
    await commit(w => ({ next: { ...w, docs: w.docs.map(other => other.id === item.id ? touchDoc(other, changes) : other) } }))
    if (changes.trashed) pick('')
    setShowActions(false)
  }
  function removeItem(item: Doc | Folder | Project, kind: 'doc' | 'folder' | 'project') {
    setShowActions(false); setShowProjectActions(false)
    setConfirm({ title: '휴지통으로 이동', verb: '이동', description: ('title' in item ? item.title : item.name) + '을(를) 휴지통으로 이동합니다. 이후 복원할 수 있습니다.', confirmed: async () => {
      if (kind === 'doc') await docChange(item as Doc, { trashed: true })
      else if (kind === 'folder') await folderChange(item as Folder, { trashed: true })
      else await projectChange(item as Project, { trashed: true })
    } })
  }
  async function duplicate(item: Doc, snapshot?: { title: string; markdown: string }) {
    if (!snapshot) await draft.flush()
    const sourceState = current.current
    const source = sourceState.docs.find(doc => doc.id === item.id) ?? item
    const copy = makeDoc({ projectId: item.projectId, folderId: item.folderId }, (snapshot?.title || source.title).slice(0, 88) + (snapshot ? ' · 복구본' : ' · 복제'), snapshot?.markdown ?? source.markdown)
    copy.tags = source.tags
    const uploads: Upload[] = []
    for (const asset of source.assets) {
      const id = newId()
      const copied = { ...asset, id, filename: id + '.' + asset.filename.split('.').at(-1) }
      copy.markdown = copy.markdown.replaceAll(assetUrl(asset), assetUrl(copied))
      uploads.push({ asset: copied, blob: await repo.asset(sourceState, asset) }); copy.assets.push(copied)
    }
    await commit(w => ({ next: { ...w, docs: [...w.docs, copy] }, uploads }))
    if (snapshot) draft.discard()
    await openDoc(copy)
  }
  async function addFiles(items: File[]) {
    if (!doc || !items.length || attaching || readOnly) return
    setAttaching(true); setIsOver(false)
    try {
      if (items.length > 30) throw Error('한 번에 최대 30개 파일을 첨부할 수 있습니다.')
      const uploads: Upload[] = []
      for (const file of items) uploads.push(await makeUpload(file, file.name, prefs.exif))
      await draft.flush()
      await commit(w => {
        const original = w.docs.find(item => item.id === doc.id)
        if (!original) throw Error('문서를 찾을 수 없습니다.')
        const added = uploads.map(({ asset }) => imageMarkdown(asset, asset.name, '')).join('\n\n')
        return { next: { ...w, docs: w.docs.map(item => item.id === doc.id ? touchDoc(item, { assets: [...item.assets, ...uploads.map(upload => upload.asset)], markdown: item.markdown.trimEnd() + '\n\n' + added + '\n' }) : item) }, uploads }
      })
      setNotice('첨부 ' + uploads.length + '개 저장 완료')
    } finally { setAttaching(false) }
  }
  async function replaceAttachment(target: Asset, replacement: string | null) {
    if (!doc || readOnly) return
    await draft.flush()
    await commit(w => ({
      next: { ...w, docs: w.docs.map(item => {
        if (item.id !== doc.id) return item
        const matches = assetOccurrences(item.markdown, target)
        let text = item.markdown
        for (const range of matches.reverse()) text = text.slice(0, range.from) + (replacement ?? '') + text.slice(range.to)
        return touchDoc(item, { markdown: text, assets: replacement === null ? item.assets.filter(asset => asset.id !== target.id) : item.assets })
      }) },
    }))
  }
  async function shiftAsset(index: number, amount: number) {
    if (!doc || readOnly) return
    await draft.flush()
    await commit(w => ({
      next: { ...w, docs: w.docs.map(item => {
        if (item.id !== doc.id) return item
        const assets = [...item.assets]
        const a = assets[index], b = assets[index + amount]
        if (!a || !b) return item
        const [first] = assetOccurrences(item.markdown, a), [second] = assetOccurrences(item.markdown, b)
        let s = item.markdown
        if (first && second) {
          const [left, right] = [first, second].sort((a, b) => a.from - b.from)
          s = s.slice(0, left.from) + s.slice(right.from, right.to) + s.slice(left.to, right.from) + s.slice(left.from, left.to) + s.slice(right.to)
        }
        assets[index] = b; assets[index + amount] = a
        return touchDoc(item, { markdown: s, assets })
      }) },
    }))
  }
  function linkOpen(href: string) {
    if (href.startsWith('#')) {
      const index = outlineOf(markdown).findIndex(item => item.title.toLowerCase().trim().replace(/\s+/g, '-') === decodeURIComponent(href.slice(1)).toLowerCase())
      if (index >= 0) goToHeading(index)
    } else if (doc) {
      const path = resolveLocal(docPath(state, doc), href)
      const linked = availableDocs.find(item => pathKey(docPath(state, item)) === path)
      if (linked) perform(() => openDoc(linked))
      else setError('상대경로 문서를 찾을 수 없습니다. ' + href)
    }
  }
  async function acceptImport(incoming: ImportedProject) {
    await draft.flush()
    const stored = await commit(w => {
      const base = incoming.project.name
      let name = base, count = 2
      while (w.projects.some(p => !p.trashed && sameName(p.name, name))) name = base.slice(0, 86) + ' (' + count++ + ')'
      return { next: { ...w, projects: [...w.projects, { ...incoming.project, name }], folders: [...w.folders, ...incoming.folders], docs: [...w.docs, ...incoming.docs] }, uploads: incoming.uploads }
    })
    if (incoming.docs[0] && !incoming.docs[0].trashed) await openDoc(incoming.docs[0])
    else await selectLocation(stored.projects.at(-1)!.id, null)
    setNotice('프로젝트 가져오기 완료 · 문서 ' + incoming.docs.length + '개')
    if (incoming.warnings.length) setError(incoming.warnings.slice(0, 4).join(' · '))
  }
  async function importFiles(files: File[]) {
    if (!files.length) return
    await draft.flush()
    for (const file of files) {
      if (/\.zip$/i.test(file.name)) { await acceptImport(await importZip(file, file.name.replace(/\.zip$/i, ''))); continue }
      if (!/\.(md|markdown)$/i.test(file.name) || file.size > MAX_TEXT) throw Error('4 MiB 이하 Markdown 또는 프로젝트 ZIP을 선택하세요.')
      const parsed = readMarkdown(decodeText(await file.arrayBuffer()))
      const project = current.current.projects.find(item => item.id === projectId && !item.trashed && !item.archived)
      const fallback = project ?? { id: newId(), name: '가져온 문서', archived: false, trashed: false }
      const record = makeDoc({ projectId: fallback.id, folderId: project ? folderId : null }, parsed.title || file.name.replace(/\.(md|markdown)$/i, ''), parsed.body)
      record.tags = parsed.tags ?? []
      record.createdAt = parsed.createdAt ?? record.createdAt
      record.updatedAt = parsed.updatedAt ?? record.updatedAt
      await commit(w => ({ next: { ...w, projects: w.projects.some(item => item.id === fallback.id) ? w.projects : [...w.projects, fallback], docs: [...w.docs, record] } }))
      await openDoc(record)
      const warnings: string[] = []
      if (parsed.unknown?.length) warnings.push('추가 YAML 속성이 제외되었습니다.')
      let relative = false
      visit(markdownTree(parsed.body), node => { if (node.url && !/^(https?:|mailto:|#)/i.test(node.url)) relative = true })
      if (relative) warnings.push('상대경로 첨부가 있으면 폴더 또는 ZIP으로 가져오세요.')
      if (warnings.length) setError(warnings.join(' '))
      setNotice('문서 가져오기 완료')
    }
  }
  async function downloadProject(item: Project, directory = false) {
    const folder = directory && repo.kind === 'web' ? await selectFolder() : undefined
    await draft.flush()
    const ready = await makeProjectZip(current.current, item, repo)
    if (directory) {
      const files = await unzipSecure(ready)
      if (repo.kind === 'desktop') {
        const encoded = []
        for (const file of files.values()) encoded.push({ path: file.name, base64: await encodeBlob(file.blob) })
        if (!await invoke<boolean>('workspace_export_directory', { name: safeName(item.name) + '-' + newId().slice(0, 8), files: encoded })) return
      } else if (folder) await writeFolder(folder, item.name, files.values())
    } else if (!await saveDownload(ready, safeName(item.name) + '.zip')) return
    setNotice(directory ? '프로젝트 폴더 내보내기 완료' : '프로젝트 ZIP 다운로드를 요청했습니다')
  }
  const openLocationName = folderId ? state.folders.find(f => f.id === folderId)?.name : project?.name
  const displayView = query.trim() ? 'search' : view
  const canWrite = !!project && !project.archived
  async function moveTarget(target: MoveTarget, destination: Selection) {
    if (target.type === 'folder') {
      await folderChange(target.item, { parentId: destination.folderId })
    } else {
      await draft.flush()
      await commit(w => {
        ensureDestination(w, destination)
        const item = w.docs.find(doc => doc.id === target.item.id)
        if (!item || isTrashed(w, item) || w.projects.find(p => p.id === item.projectId)?.archived) throw Error('이 문서를 이동할 수 없습니다.')
        if (item.folderId === destination.folderId && item.projectId === destination.projectId) return { next: w }
        return { next: { ...w, docs: w.docs.map(other => other.id === item.id ? touchDoc(other, destination) : other) } }
      })
    }
    setNotice('이동 완료 · ' + ('title' in target.item ? target.item.title : target.item.name))
  }
  const drag = {
    item(target: MoveTarget) {
      return {
        draggable: true,
        onDragStart(event: DragEvent) {
          dragItem.current = target
          event.dataTransfer.effectAllowed = 'move'
          event.dataTransfer.setData('application/x-prestique-entry', target.item.id)
        },
        onDragEnd() { dragItem.current = null; setDropKey('') },
      }
    },
    destination(destination: Selection) {
      const key = destination.folderId ?? destination.projectId
      function eligible() {
        const target = dragItem.current
        if (!target) return false
        if (target.type === 'doc') return target.item.projectId !== destination.projectId || target.item.folderId !== destination.folderId
        return target.item.projectId === destination.projectId && target.item.parentId !== destination.folderId &&
          !folderChain(state, destination.folderId).some(folder => folder.id === target.item.id)
      }
      return {
        'data-drop-active': dropKey === key || undefined,
        onDragOver(event: DragEvent) {
          if (eligible()) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropKey(key) }
        },
        onDragLeave(event: DragEvent) {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropKey(active => active === key ? '' : active)
        },
        onDrop(event: DragEvent) {
          const target = dragItem.current
          if (!target || !eligible() || event.dataTransfer.getData('application/x-prestique-entry') !== target.item.id) return
          event.preventDefault()
          dragItem.current = null; setDropKey('')
          perform(() => moveTarget(target, destination))
        },
      }
    },
  }
  return <div className="app-frame">
    <input type="file" ref={documentInput} className="file-input" accept=".md,.markdown,.zip" multiple onChange={e => { const files = Array.from(e.target.files ?? []); e.target.value = ''; perform(() => importFiles(files)) }} />
    <input type="file" ref={folderInput} className="file-input" {...{ webkitdirectory: '' }} multiple onChange={e => { const files = Array.from(e.target.files ?? []); e.target.value = ''; if (files.length) perform(async () => acceptImport(await readDirectory(files))) }} />
    <input type="file" ref={imageInput} className="file-input" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" multiple onChange={e => { const files = Array.from(e.target.files ?? []); e.target.value = ''; perform(() => addFiles(files)) }} />
    <input type="file" ref={cameraInput} className="file-input" accept="image/*" capture="environment" onChange={e => { const files = Array.from(e.target.files ?? []); e.target.value = ''; perform(() => addFiles(files)) }} />
    <header className="app-header">
      <div className="app-identity">
        <Action label="탐색 메뉴" ref={navTrigger} className="mobile-nav" icon={<Menu size={19} />} variant="ghost" isIconOnly aria-expanded={showNav} aria-controls="project-navigation" onClick={() => setShowNav(!showNav)} />
        <Brand /><span>Workspace</span>
      </div>
      <div className="search-bar"><Field label="문서 검색" isLabelHidden startIcon={<Search size={17} />} placeholder="문서 제목과 본문 검색" value={query} onChange={setQuery} ref={searchInput} hasClear /><kbd>Ctrl K</kbd></div>
      <div className="header-buttons">
        <span className={'status ' + draft.status} role="status">{draft.status === 'saving' ? <LoaderCircle size={15} className="spin" /> : draft.status === 'saved' ? <Check size={15} className="save-pop" /> : ['error','conflict'].includes(draft.status) ? <CircleAlert size={15} /> : online ? <HardDrive size={15} /> : <CloudOff size={15} />}<span>{!online && draft.status === 'clean' ? '오프라인 · 이 기기에 저장' : statusText[draft.status]}</span></span>
        <Action label="설정" icon={<Settings2 size={19}/>} variant="ghost" isIconOnly onClick={() => {
          setSettingsOpen(true)
          if (repo.kind === 'web') void navigator.storage?.estimate().then(x => setQuota(formatSize(x.usage ?? 0) + ' 사용 · 최대 약 ' + formatSize(x.quota ?? 0))).catch(() => {})
        }} />
      </div>
    </header>
    {showNav && <button className="nav-backdrop" aria-label="탐색 닫기" onClick={() => setShowNav(false)} />}
    <aside id="project-navigation" ref={navPanel} className={'sidebar ' + (showNav ? 'nav-open' : '')} aria-label="프로젝트 탐색">
      <div className="workspace-name"><div className="workspace-icon" aria-hidden="true">{Array.from(state.name)[0]?.toLocaleUpperCase('ko-KR')}</div><div><strong>{state.name}</strong><small>작업공간</small></div></div>
      <div className="nav-heading"><h2>프로젝트</h2><Action label="프로젝트 추가" icon={<Plus size={17} />} variant="ghost" isIconOnly onClick={createProject} /></div>
      <nav className="tree" aria-label="프로젝트와 폴더">
        {state.projects.filter(p => !p.trashed && !p.archived).map(p => <div key={p.id}>
          <button {...drag.destination({ projectId: p.id, folderId: null })} className={rowClass(projectId === p.id && !folderId && !doc && view === 'projects')} onClick={() => perform(() => selectLocation(p.id, null))}>
            {projectId === p.id ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}<FolderClosed size={17}/><span>{p.name}</span>
          </button>
          {projectId === p.id && <TreeBranch state={state} project={p.id} parent={null} currentFolder={folderId} active={openId} drag={drag}
            onFolder={id => perform(() => selectLocation(p.id, id))} onDoc={item => perform(() => openDoc(item))} />}
        </div>)}
        {!state.projects.some(p => !p.trashed && !p.archived) && <p className="tree-empty">아직 프로젝트가 없습니다.</p>}
      </nav>
      <div className="nav-footer">
        <button className={rowClass(false)} onClick={() => documentInput.current?.click()}><ArrowUpToLine size={16}/> 가져오기</button>
        <button className={rowClass(view === 'archive')} onClick={() => perform(async () => { await draft.flush(); setView('archive'); setQuery(''); setShowNav(false) })}><Archive size={17}/> 보관된 프로젝트</button>
        <button className={rowClass(view === 'trash')} onClick={() => perform(async () => { await draft.flush(); setView('trash'); setQuery(''); setShowNav(false) })}><Trash2 size={17}/> 휴지통</button>
        <div className="local-note"><HardDrive size={14}/> {repo.kind === 'desktop' ? 'Windows 로컬 폴더' : '이 브라우저에 저장'}</div>
      </div>
    </aside>
    <main className="work-main" onDragEnter={e => { if (doc && e.dataTransfer.types.includes('Files')) setIsOver(true) }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsOver(false) }}>
      {error && <div role="alert" className="banner failure"><CircleAlert size={18}/><span>{error}</span><Action label="오류 닫기" icon={<X size={16}/>} variant="ghost" isIconOnly onClick={() => setError('')} /></div>}
      {draft.error && displayView === 'projects' && doc && <div role="alert" className="banner failure"><CircleAlert size={18}/><span>{draft.error}</span>
        {draft.status === 'conflict' ? <>
          <Action label="두 버전 비교" size="sm" onClick={() => setConfirm({ title: '저장 충돌', verb: '복구본으로 보존', description: '내 초안 “' + title + '” · ' + markdown.slice(0, 140) + ' / 저장된 문서 · ' + (current.current.docs.find(d => d.id === doc.id)?.markdown ?? '').slice(0, 140), confirmed: async () => { await reload(); await duplicate(doc, { title, markdown }) } })} />
          <Action label="저장된 버전 적용" size="sm" onClick={() => setConfirm({ title: '저장된 버전 적용', verb: '초안 폐기', description: '현재 이 기기의 미저장 초안을 폐기합니다.', confirmed: async () => { await reload(); draft.discard() } })} />
          <Action label="내 초안 적용" size="sm" onClick={() => setConfirm({ title: '내 초안 적용', verb: '초안으로 저장', description: '현재 저장된 본문을 내 초안으로 바꿉니다.', confirmed: async () => {
            await reload()
            await commit(w => {
              if (!w.docs.some(item => item.id === doc.id && !isTrashed(w, item))) throw Error('기존 문서가 삭제되었습니다. 초안을 복구본으로 보존하세요.')
              return { next: { ...w, docs: w.docs.map(item => item.id === doc.id ? touchDoc(item, { title: label(title), markdown }) : item) } }
            })
            draft.discard()
          } })} />
        </> : <Action label="다시 저장" size="sm" onClick={() => perform(() => draft.flush(true))} />}
        <Action size="sm" label="초안 다운로드" onClick={() => perform(() => saveDownload(new Blob([markdown], { type: 'text/markdown' }), safeName(title) + '.md'))}/>
      </div>}
      {draft.restored && !draft.error && <div className="banner" role="status"><CircleAlert size={16} /> 미저장 초안을 복구했습니다. 변경 내용을 확인한 뒤 저장하세요.</div>}
      {displayView === 'search' ? <section className="overview">
        <div className="overview-title"><div><h1>검색 결과</h1><p>“{query}” · {hits.length}개 문서</p></div>
          <select aria-label="검색 범위" value={scope} onChange={e => setScope(e.target.value as typeof scope)}><option value="workspace">작업공간 전체</option><option value="project" disabled={!projectId}>현재 프로젝트</option><option value="folder" disabled={!folderId}>현재 폴더</option></select>
        </div>
        <div className="records">{hits.map(hit => <button className="record" key={hit.doc.id} onClick={() => perform(() => openDoc(hit.doc))}><FileText size={18}/><span><strong>{hit.doc.title}</strong><small>{hit.path}</small>{hit.text && <p>{hit.text}</p>}</span><ChevronRight size={16}/></button>)}
        {!hits.length && <p className="quiet">검색 결과가 없습니다.</p>}</div>
      </section> : displayView === 'trash' ? <section className="overview">
        <div className="overview-title"><div><h1>휴지통</h1><p>삭제된 항목을 이전 위치로 복원합니다.</p></div></div>
        <div className="records">
          {state.projects.filter(p => p.trashed).map(p => <RestoreRow key={p.id} label={p.name} kind="프로젝트" restore={() => perform(() => projectChange(p, { trashed: false }))}/>)}
          {state.folders.filter(f => f.trashed && !state.projects.find(p => p.id === f.projectId)?.trashed && !folderChain(state, f.parentId).some(parent => parent.trashed)).map(f => <RestoreRow key={f.id} label={f.name} kind="폴더" restore={() => perform(() => folderChange(f, { trashed: false }))}/>)}
          {state.docs.filter(d => d.trashed && !state.projects.find(p => p.id === d.projectId)?.trashed && !folderChain(state, d.folderId).some(f => f.trashed)).map(d => <RestoreRow key={d.id} label={d.title} kind="문서" restore={() => perform(() => docChange(d, { trashed: false }))}/>)}
          {!state.projects.some(p => p.trashed) && !state.folders.some(f => f.trashed) && !state.docs.some(d => d.trashed) && <p className="quiet">휴지통이 비어 있습니다.</p>}
        </div>
      </section> : displayView === 'archive' ? <section className="overview">
        <div className="overview-title"><div><h1>보관된 프로젝트</h1><p>보관한 프로젝트를 다시 활성화합니다.</p></div></div>
        {state.projects.filter(p => p.archived && !p.trashed).map(p => <RestoreRow key={p.id} label={p.name} kind="프로젝트" restore={() => perform(() => projectChange(p, { archived: false }))}/>)}
        {!state.projects.some(p => p.archived && !p.trashed) && <p className="quiet">보관된 프로젝트가 없습니다.</p>}
      </section> : doc ? <>
        <div className="document-top">
          <div className="breadcrumb"><button title="폴더 돌아가기" onClick={() => perform(() => selectLocation(doc.projectId, doc.folderId))}><ArrowLeft size={15}/></button>
            <FolderClosed size={15}/><span>{[state.projects.find(p => p.id === doc.projectId)?.name, ...folderChain(state, doc.folderId).map(f => f.name)].filter(Boolean).join(' / ')}</span>
          </div>
          <div className="document-actions">
            {draft.status !== 'clean' && <Action size="sm" label="저장" onClick={() => perform(() => draft.flush())} isDisabled={readOnly || draft.status === 'saving' || draft.status === 'conflict'} />}
            <Action label="PDF 출력" size="sm" icon={<Printer size={16}/>} onClick={() => setPrint(true)} />
            <Action label="문서 정보" size="sm" icon={<PanelRight size={17}/>} isIconOnly variant="ghost" aria-pressed={inspector} onClick={() => setInspector(!inspector)} />
            <Action label="문서 작업" size="sm" variant="ghost" icon={<ChevronDown size={16}/>} onClick={() => setShowActions(!showActions)} aria-expanded={showActions} />
            {showActions && <div className="pop-menu">
              <button onClick={() => perform(async () => { await saveDownload(new Blob([toMarkdownFile({ ...doc, title, markdown })], { type: 'text/markdown' }), doc.filename); setShowActions(false) })}>Markdown 다운로드</button>
              {!readOnly && <><button onClick={() => perform(() => duplicate(doc))}>복제</button><button onClick={() => { setMove({ item: doc, type: 'doc' }); setShowActions(false) }}>폴더로 이동</button><button className="danger-text" onClick={() => removeItem(doc,'doc')}>휴지통으로 이동</button></>}
            </div>}
          </div>
        </div>
        <div className={'document-layout ' + (inspector ? 'with-inspector' : '')}>
          <section className="document-pane">
            <label className="sr-only" htmlFor="document-title">문서 제목</label>
            <input id="document-title" className="document-title" value={title} disabled={readOnly} onChange={e => draft.change('title', e.target.value)} placeholder="제목 없음" maxLength={100}/>
            <div className="document-metadata"><span>Markdown 문서</span><span>{new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(doc.updatedAt))} 수정</span></div>
            <div className="document-tools">
              <div className="segmented" role="group" aria-label="편집 보기">
                {(Object.keys(modes) as Mode[]).map(key => <button className="press" key={key} aria-pressed={(readOnly ? 'preview' : mode) === key} disabled={readOnly && key !== 'preview'} onClick={() => setMode(key)}>{modes[key]}</button>)}
              </div>
              {!readOnly && <div className="attachment-tools">
                <Action label="첨부 선택" size="sm" icon={<Plus size={15}/>} variant="ghost" onClick={() => imageInput.current?.click()} isLoading={attaching} />
                <Action label="카메라로 촬영" size="sm" icon={<Camera size={17}/>} variant="ghost" isIconOnly onClick={() => cameraInput.current?.click()} isDisabled={attaching} />
              </div>}
            </div>
            {attaching && <div className="banner asset-arrival" role="status"><LoaderCircle size={17} className="spin" /> 첨부 파일 검사 및 저장 중</div>}
            <DocumentEditor key={doc.id} doc={doc} state={state} repo={repo} value={markdown} mode={readOnly ? 'preview' : mode} onChange={v => draft.change('markdown', v)}
              onFiles={() => imageInput.current?.click()} onLink={setLink => setPrompt({ title: '링크 삽입', field: '주소 또는 상대경로', verb: '삽입', confirmed: value => { if (!allowedLink(value)) throw Error('지원하지 않는 주소입니다.'); setLink(value) } })}
              openLink={linkOpen} print={print} drag={isOver} onDrop={files => perform(() => addFiles(files))} onPasteImage={files => perform(() => addFiles(files))} />
          </section>
          {inspector && <aside className="inspector" aria-label="문서 정보">
            <div className="inspector-title"><h2>문서 정보</h2><Action label="정보 닫기" icon={<X size={17}/>} isIconOnly variant="ghost" onClick={() => setInspector(false)} /></div>
            <h3>목차</h3>{headings.length ? headings.map((heading, index) => <button className="outline-row" key={index} style={{ paddingInlineStart: 8 + (heading.level - 1) * 8 }} onClick={() => {
              if (mode === 'source') { setMode('preview'); setTimeout(() => goToHeading(index), 100) } else goToHeading(index)
            }}>{heading.title}</button>) : <p className="quiet">본문에 제목 서식을 추가하세요.</p>}
            <h3>첨부 파일 <span>{doc.assets.length}</span></h3>
            {!doc.assets.length && <p className="quiet">첨부 파일이 없습니다.</p>}
            {doc.assets.map((asset, index) => <div className="asset-row" key={asset.id}>
              <button onClick={() => setAttachment(asset)} title={asset.name}><strong>{asset.name}</strong><small>{formatSize(asset.size)}</small></button>
              <Action label="첨부 위로" size="sm" icon={<ArrowUp size={14}/>} isIconOnly variant="ghost" isDisabled={readOnly || index === 0} onClick={() => perform(() => shiftAsset(index, -1))}/>
              <Action label="첨부 아래로" size="sm" icon={<ArrowDown size={14}/>} isIconOnly variant="ghost" isDisabled={readOnly || index === doc.assets.length - 1} onClick={() => perform(() => shiftAsset(index, 1))}/>
            </div>)}
          </aside>}
        </div>
      </> : project ? <section className="overview">
        <div className="overview-title">
          <div><div className="breadcrumb">{project.name}{folderId && ' / ' + folderChain(state, folderId).map(f => f.name).join(' / ')}</div><h1>{openLocationName}</h1></div>
          <div className="overview-actions">
            {canWrite && <><Action label="새 폴더" icon={<FolderPlus size={17}/>} onClick={createFolder}/><Action label="새 문서" icon={<FilePlus2 size={17}/>} variant="primary" onClick={newDocument}/></>}
            <Action label="프로젝트 작업" icon={<ChevronDown size={16}/>} variant="ghost" aria-expanded={showProjectActions} onClick={() => setShowProjectActions(!showProjectActions)} />
            {showProjectActions && <div className="pop-menu">
              <button onClick={() => documentInput.current?.click()}>Markdown / ZIP 가져오기</button>
              <button onClick={() => folderInput.current?.click()}>폴더 가져오기</button>
              <button onClick={() => perform(() => downloadProject(project))}>프로젝트 ZIP 내보내기</button>
              {(repo.kind === 'desktop' || canWriteFolder()) && <button onClick={() => perform(() => downloadProject(project, true))}>프로젝트 폴더 내보내기</button>}
              {folderId ? <>
                <button onClick={() => { const target = state.folders.find(f => f.id === folderId)!; setPrompt({ title: '폴더 이름 변경', field: '폴더 이름', initial: target.name, confirmed: name => folderChange(target, { name: label(name) }) }) }}>폴더 이름 변경</button>
                <button onClick={() => { setMove({ item: state.folders.find(f => f.id === folderId)!, type: 'folder' }); setShowProjectActions(false) }}>폴더 이동</button>
                <button className="danger-text" onClick={() => removeItem(state.folders.find(f => f.id === folderId)!, 'folder')}>폴더를 휴지통으로</button>
              </> : <>
                <button onClick={() => setPrompt({ title: '프로젝트 이름 변경', field: '프로젝트 이름', initial: project.name, confirmed: name => projectChange(project, { name: label(name) }) })}>프로젝트 이름 변경</button>
                <button onClick={() => perform(() => projectChange(project, { archived: true }))}>프로젝트 보관</button>
                <button className="danger-text" onClick={() => removeItem(project,'project')}>프로젝트를 휴지통으로</button>
              </>}
            </div>}
          </div>
        </div>
        <div className="records">
          {state.folders.filter(folder => folder.projectId === projectId && folder.parentId === folderId && !folder.trashed).map(folder => <button className="record" key={folder.id} onClick={() => perform(() => selectLocation(project.id, folder.id))}><FolderClosed size={20}/><strong>{folder.name}</strong><ChevronRight size={16}/></button>)}
          {availableDocs.filter(item => item.projectId === projectId && item.folderId === folderId).map(item => <button className="record" key={item.id} onClick={() => perform(() => openDoc(item))}><FileText size={20}/><strong>{item.title}</strong><ChevronRight size={16}/></button>)}
          {!state.folders.some(item => item.projectId === projectId && item.parentId === folderId && !item.trashed) && !availableDocs.some(item => item.projectId === projectId && item.folderId === folderId) &&
            <div className="empty-project"><span className="empty-icon" aria-hidden="true"><FileText size={21}/></span><div><h2>이 위치에 문서가 없습니다</h2><p>새 문서를 만들거나 기존 Markdown 파일을 가져오세요.</p></div><Action label="Markdown 가져오기" icon={<ArrowUpToLine size={16}/>} onClick={() => documentInput.current?.click()} /></div>}
        </div>
      </section> : <section className="overview">
        <div className="overview-title"><div><h1>작업공간</h1><p>프로젝트 단위로 문서와 첨부를 관리합니다.</p></div></div>
        <div className="empty-project empty-workspace"><span className="empty-icon" aria-hidden="true"><FolderPlus size={21}/></span><h2>{state.projects.some(p => !p.trashed && !p.archived) ? '프로젝트를 선택하세요' : '첫 프로젝트를 만드세요'}</h2>
          <div className="empty-actions"><Action label="새 프로젝트" icon={<Plus size={17}/>} variant="primary" onClick={createProject}/><Action label="Markdown / ZIP 가져오기" icon={<ArrowUpToLine size={16}/>} onClick={() => documentInput.current?.click()}/><Action label="폴더 가져오기" onClick={() => folderInput.current?.click()}/></div>
        </div>
      </section>}
    </main>
    {notice && <div className="toast" role="status"><Check size={18} /><span>{notice}</span></div>}
    {settingsOpen && <Modal close={() => setSettingsOpen(false)} title="작업공간 설정">
      <Brand full />
      <div className="settings-list">
        <label>화면 테마<select value={prefs.theme} onChange={e => changePrefs({ ...prefs, theme: e.target.value as StoragePrefs['theme'] })}><option value="system">시스템 설정</option><option value="light">라이트</option><option value="dark">다크</option></select></label>
        <label>자동 저장 간격<select value={prefs.delay} onChange={e => changePrefs({ ...prefs, delay: Number(e.target.value) })}><option value={500}>0.5초</option><option value={760}>0.76초</option><option value={1500}>1.5초</option></select></label>
        <label><span>모션 줄이기</span><input type="checkbox" checked={prefs.reduced} onChange={e => changePrefs({ ...prefs, reduced: e.target.checked })}/></label>
        <label><span>사진의 EXIF 제거 후 저장</span><input type="checkbox" checked={prefs.exif} onChange={e => changePrefs({ ...prefs, exif: e.target.checked })}/></label>
      </div>
      <p className="quiet">EXIF 제거를 켜면 변환된 사진을 저장합니다. GIF는 정지 이미지로 변환됩니다. 한 파일은 24 MiB까지 첨부할 수 있습니다.</p>
      <p className="quiet">{repo.kind === 'web' ? '브라우저 데이터가 삭제되면 문서도 삭제될 수 있습니다. 프로젝트 작업에서 ZIP 백업을 저장하세요. ' + quota : '문서와 첨부는 선택한 작업공간 폴더에 저장됩니다.'} 기기 간 이전에는 프로젝트 ZIP을 사용합니다.</p>
      <div className="dialog-actions">
        <Action label="외부 변경 다시 읽기" onClick={() => { statusChanged.current(); setSettingsOpen(false) }} />
        <Action label="다른 작업공간" onClick={() => perform(async () => { await draft.flush(); await leave() })} />
      </div>
    </Modal>}
    {prompt && <TextPrompt {...prompt} close={() => setPrompt(null)} />}
    {confirm && <Confirm {...confirm} close={() => setConfirm(null)} />}
    {move && <MoveDialog state={state} target={move} close={() => setMove(null)} applied={destination => moveTarget(move, destination)} />}
    {print && doc && <PrintDialog repo={repo} close={() => setPrint(false)} />}
    {attachment && doc && <AttachmentDialog asset={attachment} doc={doc} repo={repo} state={state} readOnly={readOnly}
      close={() => setAttachment(null)} update={(alt, caption) => replaceAttachment(attachment, imageMarkdown(attachment, alt, caption))}
      remove={() => replaceAttachment(attachment, null)} />}
  </div>
}
const rowClass = (active: boolean) => 'tree-row press ' + (active ? 'active-row' : '')
type TreeDrag = {
  item(target: MoveTarget): { draggable: boolean; onDragStart: (event: DragEvent) => void; onDragEnd: () => void }
  destination(place: Selection): { 'data-drop-active'?: boolean; onDragOver: (event: DragEvent) => void; onDragLeave: (event: DragEvent) => void; onDrop: (event: DragEvent) => void }
}
function TreeBranch({ state, project, parent, currentFolder, active, onFolder, onDoc, drag }: { state: Workspace; project: string; parent: string | null; currentFolder: string | null; active: string; onFolder: (id: string) => void; onDoc: (doc: Doc) => void; drag: TreeDrag }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const currentPath = folderChain(state, currentFolder)
  return <div className="tree-branch">
    {state.folders.filter(folder => folder.projectId === project && folder.parentId === parent && !folder.trashed).map(folder => {
      const isOpen = expanded[folder.id] ?? currentPath.some(p => p.id === folder.id)
      return <div key={folder.id}><div {...drag.destination({ projectId: project, folderId: folder.id })} className={'folder-row ' + (currentFolder === folder.id ? 'active-row' : '')}>
        <button className="tree-toggle" aria-label={folder.name + (isOpen ? ' 접기' : ' 펼치기')} aria-expanded={isOpen} onClick={() => setExpanded({ ...expanded, [folder.id]: !isOpen })}>{isOpen ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}</button>
        <button {...drag.item({ item: folder, type: 'folder' })} className={rowClass(false)} onClick={() => { setExpanded({ ...expanded, [folder.id]: true }); onFolder(folder.id) }}><FolderClosed size={16}/><span>{folder.name}</span></button>
      </div>{isOpen && <TreeBranch {...{ state, project, currentFolder, active, onFolder, onDoc, drag }} parent={folder.id} />}</div>
    })}
    {state.docs.filter(doc => doc.projectId === project && doc.folderId === parent && !doc.trashed).map(doc =>
      <button {...drag.item({ item: doc, type: 'doc' })} className={rowClass(doc.id === active) + ' tree-document'} key={doc.id} aria-current={doc.id === active ? 'page' : undefined} onClick={() => onDoc(doc)}><FileText size={15}/><span>{doc.title}</span></button>)}
  </div>
}
function RestoreRow({ label, kind, restore }: { label: string; kind: string; restore: () => void }) {
  return <div className="record"><Archive size={18}/><span><strong>{label}</strong><small>{kind}</small></span><Action label="복원" size="sm" onClick={restore}/></div>
}
function MoveDialog({ state, target, close, applied }: { state: Workspace; target: { item: Doc | Folder; type: 'doc' | 'folder' }; close: () => void; applied: (place: Selection) => Promise<void> }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const items = state.projects.filter(p => !p.trashed && !p.archived && (target.type === 'doc' || target.item.projectId === p.id))
  return <Modal title="대상 폴더 선택" close={() => { if (!busy) close() }}>
    <select aria-label="이동할 위치" value={value} onChange={e => setValue(e.target.value)}><option value="">위치를 선택하세요</option>
      {items.flatMap(p => [<option key={p.id} value={p.id + '/'}>{p.name}</option>, ...state.folders.filter(f => f.projectId === p.id && !folderChain(state, f.id).some(parent => parent.trashed || parent.id === target.item.id)).map(f =>
        <option key={f.id} value={p.id + '/' + f.id}>{p.name} / {folderChain(state, f.id).map(location => location.name).join(' / ')}</option>)])}
    </select>
    {error && <p role="alert" className="failure-inline">{error}</p>}
    <div className="dialog-actions"><Action label="이동" variant="primary" isDisabled={!value} isLoading={busy} onClick={async () => {
      setBusy(true)
      const [projectId, folderId] = value.split('/')
      try { await applied({ projectId, folderId: folderId || null }); close() } catch (err) { setError(message(err)) }
      finally { setBusy(false) }
    }} /></div>
  </Modal>
}
function PrintDialog({ repo, close }: { repo: Repository; close: () => void }) {
  const [orientation, setOrientation] = useState('portrait')
  const [margin, setMargin] = useState('16')
  const [numbers, setNumbers] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = '@page { size: A4 ' + orientation + '; margin: ' + margin + 'mm;' + (numbers ? ' @bottom-center { content: counter(page) " / " counter(pages); font-size: 9pt; }' : '') + '}'
    document.head.append(style)
    return () => style.remove()
  }, [orientation, margin, numbers])
  return <Modal title="PDF 출력" close={close}>
    <p>인쇄 화면에서 PDF 저장을 선택하세요. 페이지 설정은 브라우저 또는 Windows 인쇄 화면에서 확인할 수 있습니다.</p>
    <div className="settings-list">
      <label>용지<span>A4</span></label>
      <label>방향<select value={orientation} onChange={e => setOrientation(e.target.value)}><option value="portrait">세로</option><option value="landscape">가로</option></select></label>
      <label>여백<select value={margin} onChange={e => setMargin(e.target.value)}><option value="10">10 mm</option><option value="16">16 mm</option><option value="24">24 mm</option></select></label>
      <label>페이지 번호<input type="checkbox" checked={numbers} onChange={e => setNumbers(e.target.checked)}/></label>
    </div>
    {error && <p role="alert" className="failure-inline">{error}</p>}
    <div className="dialog-actions"><Action label="인쇄 화면 열기" icon={<Printer size={17}/>} variant="primary" isLoading={busy} onClick={async () => {
      setBusy(true)
      try {
        await document.fonts.ready
        await Promise.all(Array.from(document.querySelectorAll<HTMLImageElement>('.print-output img')).map(img => img.decode().catch(() => {})))
        await repo.print()
      } catch (err) { setError(message(err)) } finally { setBusy(false) }
    }} /></div>
  </Modal>
}
function AttachmentDialog({ asset, doc, repo, state, readOnly, close, update, remove }: { asset: Asset; doc: Doc; repo: Repository; state: Workspace; readOnly: boolean; close: () => void; update: (alt: string, caption: string) => Promise<void>; remove: () => Promise<void> }) {
  const info: { alt?: string; title?: string } = assetOccurrences(doc.markdown, asset)[0]?.node ?? {}
  const [alt, setAlt] = useState(info.alt ?? asset.name)
  const [caption, setCaption] = useState(info.title ?? '')
  const [preview, setPreview] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let result = '', mounted = true
    void repo.asset(state, asset).then(blob => { if (mounted && blob.type.startsWith('image/')) { result = URL.createObjectURL(blob); setPreview(result) } }).catch(err => { if (mounted) setError(message(err)) })
    return () => { mounted = false; if (result) URL.revokeObjectURL(result) }
  }, [asset.id])
  async function act(fn: () => Promise<unknown>, shouldClose: boolean) {
    try { await fn(); if (shouldClose) close() } catch (err) { setError(message(err)) }
  }
  return <Modal title="첨부 파일" close={close}>
    {preview && <img className="attach-preview" src={preview} alt={alt} />}
    <p>{asset.name} · {formatSize(asset.size)}</p>
    {!readOnly && asset.mime.startsWith('image/') && <div className="settings-list"><Field label="대체 텍스트" value={alt} onChange={setAlt}/><Field label="캡션" value={caption} onChange={setCaption}/></div>}
    {error && <p role="alert" className="failure-inline">{error}</p>}
    <div className="dialog-actions">
      {!readOnly && <Action label="첨부 삭제" onClick={() => void act(remove, true)}/>}
      <Action label="다운로드" onClick={() => void act(async () => saveDownload(await repo.asset(state, asset), asset.name), false)}/>
      {!readOnly && asset.mime.startsWith('image/') && <Action label="저장" variant="primary" onClick={() => void act(() => update(alt, caption), true)}/>}
    </div>
  </Modal>
}
function imageMarkdown(asset: Asset, alt: string, caption: string) {
  const escape = (value: string) => value.replace(/\\/g, '\\\\').replace(/[\[\]"]/g, match => '\\' + match).replace(/[\r\n]/g, ' ')
  return (asset.mime.startsWith('image/') ? '!' : '') + '[' + escape(alt) + '](' + assetUrl(asset) + (caption ? ' "' + escape(caption) + '"' : '') + ')'
}
function assetOccurrences(markdown: string, asset: Asset) {
  const matches: { from: number; to: number; node: { alt?: string; title?: string } }[] = []
  visit(markdownTree(markdown), node => {
    const from = node.position?.start.offset, to = node.position?.end.offset
    if ((node.type === 'image' || node.type === 'link') && node.url === assetUrl(asset) && from !== undefined && to !== undefined)
      matches.push({ from, to, node: node as unknown as { alt?: string; title?: string } })
  })
  return matches
}
function formatSize(bytes: number) {
  return bytes >= 1024 ** 3 ? (bytes / 1024 ** 3).toFixed(1) + ' GiB' : bytes >= 1024 ** 2 ? (bytes / 1024 ** 2).toFixed(1) + ' MiB' : Math.ceil(bytes / 1024) + ' KiB'
}
interface WritableFolder {
  getDirectoryHandle(name: string, options?: { create: boolean }): Promise<WritableFolder>
  getFileHandle(name: string, options?: { create: boolean }): Promise<{ createWritable(): Promise<{ write(blob: Blob): Promise<void>; close(): Promise<void> }> }>
}
const picker = () => (window as Window & { showDirectoryPicker?: (options: { mode: 'readwrite' }) => Promise<WritableFolder> }).showDirectoryPicker
const canWriteFolder = () => !!picker()
async function selectFolder() {
  const select = picker()
  if (!select) throw Error('이 브라우저에서는 폴더에 직접 내보낼 수 없습니다. ZIP 내보내기를 사용하세요.')
  return select.call(window, { mode: 'readwrite' })
}
async function writeFolder(base: WritableFolder, name: string, files: Iterable<{ name: string; blob: Blob }>) {
  const root = await base.getDirectoryHandle(safeName(name) + '-' + newId().slice(0, 8), { create: true })
  for (const file of files) {
    const path = file.name.split('/')
    const leaf = path.pop()!
    let folder = root
    for (const item of path) folder = await folder.getDirectoryHandle(item, { create: true })
    const handle = await folder.getFileHandle(leaf, { create: true })
    const writer = await handle.createWritable()
    await writer.write(file.blob); await writer.close()
  }
}

