#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::{engine::general_purpose::STANDARD, Engine};
use fs2::FileExt;
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{collections::{HashMap, HashSet}, fs::{self, File, OpenOptions}, io::Write, path::{Path, PathBuf}, sync::Mutex};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

type R<T> = Result<T, String>;
const META: &str = ".prestique";
const CATALOG: &str = ".prestique/catalog.json";
const JOURNAL: &str = ".prestique/journal.json";
const STAGE: &str = ".prestique/stage";
const ASSET_LIMIT: u64 = 24 * 1024 * 1024;
const TEXT_LIMIT: u64 = 4 * 1024 * 1024;

#[derive(Default)]
struct Directory { root: Option<PathBuf>, _watcher: Option<RecommendedWatcher> }
type DirectoryState = Mutex<Directory>;

fn error(e: impl std::fmt::Display) -> String { e.to_string() }
fn reparse(meta: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        return meta.file_attributes() & 0x400 != 0;
    }
    #[cfg(not(windows))]
    meta.file_type().is_symlink()
}
fn segment_ok(s: &str) -> bool {
    let names = ["con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9", "com¹", "com²", "com³", "lpt¹", "lpt²", "lpt³"];
    !s.is_empty() && s != "." && s != ".." && !s.ends_with([' ', '.'])
        && !s.chars().any(|c| c.is_control() || "<>:\"\\|?*".contains(c))
        && !names.contains(&s.split('.').next().unwrap_or("").to_lowercase().as_str())
}
fn safe(root: &Path, relative: &str) -> R<PathBuf> {
    if relative.len() > 12288 { return Err("Path too long".into()); }
    if reparse(&fs::symlink_metadata(root).map_err(error)?) { return Err("Workspace root changed".into()); }
    let mut path = root.to_path_buf();
    for part in relative.split('/') {
        if !segment_ok(part) { return Err("Unsafe workspace path".into()); }
        path.push(part);
        match fs::symlink_metadata(&path) {
            Ok(ref meta) if reparse(meta) => return Err("Symbolic links and junctions are disabled".into()),
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(error(e)),
            _ => {}
        }
    }
    Ok(path)
}
fn managed(path: &str) -> bool {
    path.starts_with("Projects/") || path.starts_with(".trash/")
}
fn managed_file(root: &Path, path: &str) -> R<PathBuf> {
    if !managed(path) { return Err("Path outside managed directories".into()); }
    let extension = Path::new(path).extension().and_then(|e| e.to_str()).unwrap_or("");
    if !["md", "png", "jpg", "jpeg", "webp", "gif", "pdf"].contains(&extension.to_lowercase().as_str()) {
        return Err("Unsupported managed file".into());
    }
    safe(root, path)
}
fn read_bounded(path: &Path, limit: u64) -> R<Vec<u8>> {
    use std::io::Read;
    let file = File::open(path).map_err(error)?;
    let metadata = file.metadata().map_err(error)?;
    if !metadata.is_file() || metadata.len() > limit { return Err("File type or size is outside workspace limits".into()); }
    let mut bytes = Vec::new();
    file.take(limit + 1).read_to_end(&mut bytes).map_err(error)?;
    if bytes.len() as u64 > limit { return Err("File grew beyond the size limit".into()); }
    Ok(bytes)
}
fn atomic(path: &Path, bytes: &[u8]) -> R<()> {
    let parent = path.parent().ok_or("Invalid output path")?;
    fs::create_dir_all(parent).map_err(error)?;
    let mut tmp = tempfile::NamedTempFile::new_in(parent).map_err(error)?;
    tmp.write_all(bytes).map_err(error)?;
    tmp.as_file().sync_all().map_err(error)?;
    tmp.persist(path).map_err(error)?;
    #[cfg(unix)]
    File::open(parent).and_then(|dir| dir.sync_all()).map_err(error)?;
    Ok(())
}
fn lock_workspace(root: &Path) -> R<File> {
    fs::create_dir_all(safe(root, META)?).map_err(error)?;
    let lock = OpenOptions::new().read(true).write(true).create(true).truncate(false).open(safe(root, ".prestique/lock")?).map_err(error)?;
    FileExt::lock_exclusive(&lock).map_err(error)?;
    Ok(lock)
}
fn hash(bytes: &[u8]) -> String { format!("{:x}", Sha256::digest(bytes)) }
fn catalog(root: &Path) -> R<Value> {
    let result: Value = serde_json::from_slice(&read_bounded(&safe(root, CATALOG)?, 16 * 1024 * 1024)?).map_err(error)?;
    if result["version"] != 1 { return Err("Unsupported workspace schema version".into()); }
    Ok(result)
}
#[derive(Serialize, Deserialize)]
struct Journal { writes: Vec<String>, removals: Vec<String>, directories: Vec<String> }
fn replay(root: &Path) -> R<()> {
    let journal = safe(root, JOURNAL)?;
    if !journal.exists() { return Ok(()); }
    let job: Journal = serde_json::from_slice(&read_bounded(&journal, 16 * 1024 * 1024)?).map_err(error)?;
    for dir in &job.directories {
        if !managed(dir) { return Err("Invalid managed directory".into()); }
        fs::create_dir_all(safe(root, dir)?).map_err(error)?;
    }
    for (index, relative) in job.writes.iter().enumerate() {
        let bytes = read_bounded(&safe(root, &format!("{STAGE}/{index}"))?, ASSET_LIMIT)?;
        atomic(&managed_file(root, relative)?, &bytes)?;
    }
    let bytes = read_bounded(&safe(root, &format!("{STAGE}/catalog"))?, 16 * 1024 * 1024)?;
    atomic(&safe(root, CATALOG)?, &bytes)?;
    for relative in &job.removals {
        let path = managed_file(root, relative)?;
        match fs::remove_file(path) {
            Ok(()) => {},
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {},
            Err(e) => return Err(error(e))
        }
    }
    fs::remove_file(journal).map_err(error)?;
    Ok(())
}
#[derive(Serialize)]
struct NativeDocument { path: String, text: String, hash: String }
#[derive(Serialize)]
struct Loaded { catalog: Value, documents: Vec<NativeDocument>, stamp: String, index_warning: Option<String> }

fn workspace_stamp_for(root: &Path, state: &Value) -> R<String> {
    let mut digest = Sha256::new();
    digest.update(state["revision"].as_str().unwrap_or("").as_bytes());
    let paths = state["locations"].as_object().ok_or("Missing catalog paths")?;
    for (key, value) in paths {
        let path = managed_file(root, value.as_str().ok_or("Invalid document path")?)?;
        digest.update(key.as_bytes());
        if let Ok(meta) = fs::metadata(path) {
            let changed = meta.modified().map_err(error)?.duration_since(std::time::UNIX_EPOCH).map_err(error)?;
            digest.update(changed.as_nanos().to_le_bytes());
            digest.update(meta.len().to_le_bytes());
        }
    }
    Ok(format!("{:x}", digest.finalize()))
}

fn index(app: &AppHandle, catalog: &Value, docs: &[NativeDocument]) -> R<()> {
    let path = app.path().app_local_data_dir().map_err(error)?;
    fs::create_dir_all(&path).map_err(error)?;
    let mut db = Connection::open(path.join("local-index.sqlite")).map_err(error)?;
    db.execute_batch("CREATE TABLE IF NOT EXISTS documents (workspace TEXT, path TEXT, checksum TEXT, body TEXT, PRIMARY KEY(workspace,path));").map_err(error)?;
    let id = catalog["id"].as_str().ok_or("Missing workspace ID")?;
    let tx = db.transaction().map_err(error)?;
    tx.execute("DELETE FROM documents WHERE workspace = ?1", [id]).map_err(error)?;
    {
        let mut statement = tx.prepare("INSERT INTO documents VALUES (?1,?2,?3,?4)").map_err(error)?;
        for doc in docs { statement.execute(params![id, doc.path, doc.hash, doc.text]).map_err(error)?; }
    }
    tx.commit().map_err(error)
}
fn load(app: &AppHandle, root: &Path) -> R<Loaded> {
    let _lock = lock_workspace(root)?;
    replay(root)?;
    let catalog = catalog(root)?;
    let mut docs = Vec::new();
    let paths = catalog["locations"].as_object().ok_or("Missing catalog paths")?;
    for relative in paths.values() {
        let relative = relative.as_str().ok_or("Invalid document path")?;
        if !relative.to_ascii_lowercase().ends_with(".md") { return Err("Invalid document path".into()); }
        let bytes = read_bounded(&managed_file(root, relative)?, TEXT_LIMIT)?;
        docs.push(NativeDocument { path: relative.to_owned(), hash: hash(&bytes), text: String::from_utf8(bytes).map_err(error)? });
    }
    let stamp = workspace_stamp_for(root, &catalog)?;
    let index_warning = index(app, &catalog, &docs).err();
    Ok(Loaded { catalog, documents: docs, stamp, index_warning })
}
fn remembered(app: &AppHandle) -> R<PathBuf> { Ok(app.path().app_local_data_dir().map_err(error)?.join("last-workspace.txt")) }
fn choose(app: &AppHandle) -> R<Option<PathBuf>> {
    app.dialog().file().set_title("PRESTIQUE Workspace · 폴더 선택").blocking_pick_folder()
        .map(|item| item.into_path().map_err(error).and_then(|p| p.canonicalize().map_err(error))).transpose()
}
fn install_workspace(app: &AppHandle, state: &DirectoryState, root: PathBuf, remember: bool) -> R<Loaded> {
    let loaded = load(app, &root)?;
    let handle = app.clone();
    let mut watcher = notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
        if let Ok(event) = event {
            if !matches!(event.kind, notify::EventKind::Access(_)) && event.paths.iter().any(|path| path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("md"))) {
                let _ = handle.emit("workspace-files-changed", ());
            }
        }
    }).map_err(error)?;
    watcher.watch(&root, RecursiveMode::Recursive).map_err(error)?;
    if remember { atomic(&remembered(app)?, root.to_string_lossy().as_bytes())?; }
    *state.lock().map_err(error)? = Directory { root: Some(root), _watcher: Some(watcher) };
    Ok(loaded)
}
#[tauri::command]
async fn workspace_open(app: AppHandle, state: State<'_, DirectoryState>, select: bool) -> R<Option<Loaded>> {
    let root = if select { choose(&app)? } else {
        let current = state.lock().map_err(error)?.root.clone();
        if current.is_some() { return current.map(|root| load(&app, &root)).transpose(); }
        if let Some(at) = std::env::args_os().position(|arg| arg == "--workspace") {
            let path = std::env::args_os().nth(at + 1).ok_or("Missing workspace folder after --workspace")?;
            return install_workspace(&app, &state, PathBuf::from(path).canonicalize().map_err(error)?, false).map(Some);
        }
        match fs::read_to_string(remembered(&app)?) {
            Ok(path) => Some(PathBuf::from(path).canonicalize().map_err(error)?),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
            Err(e) => return Err(error(e)),
        }
    };
    root.map(|root| install_workspace(&app, &state, root, true)).transpose()
}
#[tauri::command]
async fn workspace_create(app: AppHandle, state: State<'_, DirectoryState>, mut catalog: Value) -> R<Option<Loaded>> {
    let Some(root) = choose(&app)? else { return Ok(None); };
    {
        if fs::read_dir(&root).map_err(error)?.next().is_some() { return Err("새 워크스페이스는 빈 폴더를 선택하세요.".into()); }
        let _lock = lock_workspace(&root)?;
        if safe(&root, CATALOG)?.exists() { return Err("Workspace already exists".into()); }
        catalog["locations"] = serde_json::json!({});
        fs::create_dir_all(safe(&root, "Projects")?).map_err(error)?;
        atomic(&safe(&root, CATALOG)?, &serde_json::to_vec(&catalog).map_err(error)?)?;
    }
    install_workspace(&app, &state, root, true).map(Some)
}
#[derive(Deserialize)]
struct WriteRequest { path: String, text: Option<String>, source: Option<String>, base64: Option<String> }

fn commit(root: &Path, expected: &str, next: &Value, writes: Vec<WriteRequest>, removals: Vec<String>, expect: HashMap<String, String>, directories: Vec<String>) -> R<HashMap<String, String>> {
    let _lock = lock_workspace(root)?;
    replay(root)?;
    let previous = catalog(root)?;
    if previous["revision"] != expected || previous["id"] != next["id"] || next["version"] != 1 {
        return Err("충돌: 작업공간이 외부에서 변경되었습니다.".into());
    }
    for (relative, baseline) in &expect {
        let current = read_bounded(&managed_file(root, relative)?, TEXT_LIMIT).map_err(|e| format!("충돌: {e}"))?;
        if hash(&current) != *baseline { return Err(format!("충돌: 외부에서 변경된 Markdown — {relative}")); }
    }
    let mut names = HashSet::new();
    let mut hashes = HashMap::new();
    let mut paths = Vec::new();
    for (index, write) in writes.into_iter().enumerate() {
        let target = managed_file(root, &write.path)?;
        if !names.insert(write.path.to_lowercase()) || (target.exists() && !expect.contains_key(&write.path)
            && !removals.iter().any(|old| old.eq_ignore_ascii_case(&write.path) && (expect.contains_key(old) || write.source.as_ref() == Some(old)))) {
            return Err(format!("충돌: 대상 파일이 이미 존재합니다. {}", write.path));
        }
        let bytes = match (write.text, write.source, write.base64) {
            (Some(text), None, None) if text.len() as u64 <= TEXT_LIMIT && write.path.to_ascii_lowercase().ends_with(".md") => {
                let bytes = text.into_bytes();
                hashes.insert(write.path.clone(), hash(&bytes));
                bytes
            },
            (None, Some(source), None) if !source.to_ascii_lowercase().ends_with(".md") => read_bounded(&managed_file(root, &source)?, ASSET_LIMIT)?,
            (None, None, Some(encoded)) if encoded.len() as u64 <= ASSET_LIMIT.div_ceil(3) * 4 => {
                let bytes = STANDARD.decode(encoded).map_err(error)?;
                if bytes.len() as u64 > ASSET_LIMIT { return Err("Attachment exceeds size limit".into()); }
                bytes
            },
            _ => return Err("Invalid workspace write".into()),
        };
        atomic(&safe(root, &format!("{STAGE}/{index}"))?, &bytes)?;
        paths.push(write.path);
    }
    for relative in &removals { managed_file(root, relative)?; }
    let bytes = serde_json::to_vec(next).map_err(error)?;
    if bytes.len() > 16 * 1024 * 1024 { return Err("Catalog exceeds size limit".into()); }
    for dir in &directories {
        if !managed(dir) { return Err("Invalid managed directory".into()); }
        safe(root, dir)?;
    }
    atomic(&safe(root, &format!("{STAGE}/catalog"))?, &bytes)?;
    // A durable journal is published only once every replacement is staged.
    let removals = removals.into_iter().filter(|old| !names.contains(&old.to_lowercase())).collect();
    let journal = Journal { writes: paths, removals, directories };
    atomic(&safe(root, JOURNAL)?, &serde_json::to_vec(&journal).map_err(error)?)?;
    replay(root)?;
    for index in 0..journal.writes.len() {
        if let Ok(path) = safe(root, &format!("{STAGE}/{index}")) { let _ = fs::remove_file(path); }
    }
    if let Ok(path) = safe(root, &format!("{STAGE}/catalog")) { let _ = fs::remove_file(path); }
    Ok(hashes)
}
#[tauri::command]
#[allow(clippy::too_many_arguments)]
async fn workspace_commit(app: AppHandle, state: State<'_, DirectoryState>, expected: String, catalog: Value, writes: Vec<WriteRequest>, removals: Vec<String>, expect: HashMap<String, String>, directories: Vec<String>) -> R<HashMap<String, String>> {
    let guard = state.lock().map_err(error)?;
    let root = guard.root.as_ref().ok_or("No workspace open")?;
    let result = commit(root, &expected, &catalog, writes, removals, expect, directories)?;
    let _ = load(&app, root);
    Ok(result)
}
#[tauri::command]
async fn workspace_asset(state: State<'_, DirectoryState>, relative: String, workspace_id: String) -> R<String> {
    let guard = state.lock().map_err(error)?;
    let root = guard.root.as_ref().ok_or("No workspace open")?;
    let _lock = lock_workspace(root)?;
    replay(root)?;
    if catalog(root)?["id"] != workspace_id || !relative.contains("/assets/") || relative.to_ascii_lowercase().ends_with(".md") { return Err("Invalid asset request".into()); }
    Ok(STANDARD.encode(read_bounded(&managed_file(root, &relative)?, ASSET_LIMIT)?))
}
#[tauri::command]
async fn workspace_stamp(state: State<'_, DirectoryState>) -> R<String> {
    let guard = state.lock().map_err(error)?;
    let root = guard.root.as_ref().ok_or("No workspace open")?;
    let _lock = lock_workspace(root)?;
    replay(root)?;
    workspace_stamp_for(root, &catalog(root)?)
}
#[tauri::command]
fn workspace_print(window: WebviewWindow) -> R<()> { window.print().map_err(error) }

#[tauri::command]
async fn workspace_export(app: AppHandle, filename: String, base64: String) -> R<bool> {
    if !segment_ok(&filename) || base64.len() > 270 * 1024 * 1024 { return Err("Invalid export".into()); }
    let Some(target) = app.dialog().file().set_title("다른 이름으로 저장").set_file_name(&filename).blocking_save_file() else { return Ok(false); };
    let path = target.into_path().map_err(error)?;
    atomic(&path, &STANDARD.decode(base64).map_err(error)?)?;
    Ok(true)
}
#[derive(Deserialize)]
struct ExportFile { path: String, base64: String }
#[tauri::command]
async fn workspace_export_directory(app: AppHandle, name: String, files: Vec<ExportFile>) -> R<bool> {
    if !segment_ok(&name) || files.len() > 3000 { return Err("Invalid directory export".into()); }
    let Some(parent) = choose(&app)? else { return Ok(false); };
    let root = safe(&parent, &name)?;
    let staging = tempfile::Builder::new().prefix(".prestique-export-").tempdir_in(&parent).map_err(error)?;
    let mut size = 0;
    for file in files {
        let bytes = STANDARD.decode(file.base64).map_err(error)?;
        size += bytes.len();
        if size > 192 * 1024 * 1024 { return Err("Directory export exceeds size limit".into()); }
        atomic(&safe(staging.path(), &file.path)?, &bytes)?;
    }
    if root.exists() { return Err("Export folder already exists".into()); }
    fs::rename(staging.path(), root).map_err(error)?;
    Ok(true)
}

fn main() {
    tauri::Builder::default().manage(DirectoryState::default()).plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![workspace_open, workspace_create, workspace_commit, workspace_asset, workspace_stamp, workspace_print, workspace_export, workspace_export_directory])
        .run(tauri::generate_context!()).expect("PRESTIQUE Workspace startup failed");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_paths_outside_the_workspace() {
        let temp = tempfile::tempdir().unwrap();
        for path in ["../outside.md", "/outside.md", "C:/outside.md", "Projects/CON.md", "Projects/folder/../a.md", "Projects/a:stream.md"] {
            assert!(managed_file(temp.path(), path).is_err(), "{path}");
        }
        assert!(managed_file(temp.path(), "Projects/연구/실험.md").is_ok());
    }
    #[test]
    fn detects_an_external_edit_and_keeps_both_versions_untouched() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path();
        let original = serde_json::json!({"id":"test","version":1,"revision":"one"});
        atomic(&safe(root,CATALOG).unwrap(), &serde_json::to_vec(&original).unwrap()).unwrap();
        let path = "Projects/시험.md";
        let file = safe(root,path).unwrap();
        atomic(&file,b"external").unwrap();
        let updated = serde_json::json!({"id":"test","version":1,"revision":"two"});
        let attempted = WriteRequest { path:path.into(),text:Some("draft".into()),source:None,base64:None };
        assert!(commit(root,"one",&updated,vec![attempted],vec![],HashMap::from([(path.into(), hash(b"original"))]),vec![]).is_err());
        assert_eq!(fs::read(file).unwrap(),b"external");
        assert_eq!(catalog(root).unwrap()["revision"],"one");
    }
    #[test]
    fn commits_markdown_and_asset_then_moves_both_into_trash() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path();
        let initial = serde_json::json!({"id":"test","version":1,"revision":"one"});
        atomic(&safe(root,CATALOG).unwrap(), &serde_json::to_vec(&initial).unwrap()).unwrap();
        let path = "Projects/검수/기록.md";
        let asset = "Projects/검수/assets/photo.png";
        let updates = vec![
            WriteRequest { path:path.into(),text:Some("# 한글\n\n![사진](assets/photo.png)".into()),source:None,base64:None },
            WriteRequest { path:asset.into(),text:None,source:None,base64:Some(STANDARD.encode(b"attachment fixture")) }
        ];
        let active = serde_json::json!({"id":"test","version":1,"revision":"two"});
        let hashes = commit(root,"one",&active,updates,vec![],HashMap::new(),vec![]).unwrap();
        let target = ".trash/검수/기록.md";
        let target_asset = ".trash/검수/assets/photo.png";
        let moved = vec![
            WriteRequest { path:target.into(),text:Some("# 한글\n\n![사진](assets/photo.png)".into()),source:None,base64:None },
            WriteRequest { path:target_asset.into(),text:None,source:Some(asset.into()),base64:None },
        ];
        let trash = serde_json::json!({"id":"test","version":1,"revision":"three"});
        commit(root,"two",&trash,moved,vec![path.into(),asset.into()],hashes,vec![]).unwrap();
        assert!(!safe(root,path).unwrap().exists());
        assert_eq!(fs::read(safe(root,target_asset).unwrap()).unwrap(),b"attachment fixture");
        assert_eq!(fs::read_to_string(safe(root,target).unwrap()).unwrap(),"# 한글\n\n![사진](assets/photo.png)");
        assert_eq!(catalog(root).unwrap()["revision"],"three");
    }
}

