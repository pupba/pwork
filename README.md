# PRESTIQUE Workspace 1.1.0

PRESTIQUE LABS의 로컬 우선 Markdown 문서 관리 앱이다. React 19와 Meta Astryx 0.7.16을 사용하며 Windows와 Web/PWA에서 같은 편집기를 실행한다.

## 빠른 실행

| 환경 | 실행 |
|---|---|
| Windows 11 x64 | 배포물의 `PRESTIQUE-Workspace-1.1.0-x64-setup.exe`를 실행한다. 새 작업공간은 빈 폴더를 선택한다. |
| Web/PWA | 배포물의 `Web` 디렉터리를 HTTPS 정적 호스트의 `/prestique-workspace/`에 배치한다. 접속 후 브라우저의 설치 기능을 사용한다. |
| 소스에서 실행 | Node.js 22.12+ 환경에서 `npm ci` 후 `npm run dev`. 브라우저에서 `http://127.0.0.1:5173` 접속. |

Windows에서 직접 빌드하려면 MSVC C++ Build Tools, Windows SDK, Rust stable MSVC 및 WebView2가 필요하다. PowerShell에서 실행한다.

```powershell
npm ci
npm run tauri -- dev
npm run build:desktop -- -- --locked
```

설치 프로그램은 `src-tauri/target/release/bundle/nsis/`에서 생성된다. Windows에서 이미 생성된 작업공간을 경로로 지정해 직접 열 수 있다.

```powershell
.\prestique-workspace.exe --workspace 'D:\Workspace\Research'
```

## 작업 순서

1. 작업공간을 만들고 프로젝트와 폴더를 추가한다.
2. 문서를 열어 시각적 편집 도구를 사용하거나 Markdown, 분할 보기, 미리보기로 전환한다. `Ctrl+S`로 즉시 저장하고 `Ctrl+K`로 제목·본문을 검색한다.
3. 파일을 선택하거나 카메라, 붙여넣기, 드롭으로 첨부한다. **문서 정보**에서 첨부를 미리 보고 순서, 대체 텍스트, 캡션을 편집한다.
4. **PDF 출력**에서 A4 방향·여백·페이지 번호를 선택하고 인쇄 화면에서 PDF로 저장한다.
5. **프로젝트 작업**에서 ZIP 또는 지원 환경의 폴더 내보내기를 사용한다. 다른 기기에서는 ZIP 가져오기로 새로운 프로젝트를 만든다.

탐색기에서 문서를 폴더나 프로젝트로 끌어 놓을 수 있다. 폴더는 같은 프로젝트 안에서 이동한다. 터치나 키보드 환경에서는 각 작업 메뉴의 이동 명령을 사용한다. 좁은 화면에서는 탐색 메뉴와 문서 정보가 화면 가장자리에서 열리며 Esc로 닫을 수 있다.

## 데이터와 보안

- Windows는 선택한 폴더의 `Projects/`, `.trash/`, `.prestique/`에 실제 Markdown 원본과 첨부를 저장한다. SQLite 사본은 앱 데이터 폴더에 있으며 원본에서 재구축할 수 있다.
- 웹은 이 브라우저의 IndexedDB에 Markdown과 첨부 Blob을 저장한다. 브라우저의 사이트 데이터 삭제, 기기 변경, 저장소 회수에 대비해 프로젝트 ZIP을 보관한다.
- Markdown 단독 다운로드에는 첨부 바이너리가 들어가지 않는다. 상대경로 첨부까지 옮기려면 ZIP을 사용한다.
- 원격 이미지는 미리보기에서 외부 서버에 요청하지 않는다. Raw HTML, 각주, 참조형 링크가 포함된 문서는 원문에서 편집한다. 외부 파일의 추가 YAML 필드는 가져올 때 안내 후 제외한다.
- 첨부는 PNG, JPEG, WebP, GIF, PDF이며 개별 24 MiB다. Markdown은 4 MiB, ZIP 가져오기는 192 MiB 및 3,000 엔트리까지 지원한다. 읽기·쓰기 오류 때 초안 다운로드를 사용할 수 있다. EXIF 제거는 설정에서 명시적으로 켠다.
- 데이터 파일 또는 ZIP은 민감 자료일 수 있다. 저장소·웹 배포물에는 소스, 공식 BI 및 합성 테스트 데이터만 포함한다.

빌드, GitHub Pages 설정 및 검증 명령은 [BUILD_DEPLOY.md](docs/BUILD_DEPLOY.md), 제품 결정사항은 [ADR-001.md](docs/decisions/ADR-001.md), 통과·미검증·미구현 항목은 [QA_REPORT.md](docs/QA_REPORT.md)에 정리했다.

