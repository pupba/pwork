# PRESTIQUE Workspace 1.1.0 검증 결과

검증일은 2026년 11월 17일(KST)이다. 검증 환경은 Windows x64, Node.js 24.22.3, Rust 1.100.0 MSVC, Chrome 157.0.8103.80, Edge 157.0.4341.60, WebView2 157.0.4341.46이다. 로그와 이미지는 배포 ZIP의 `QA/`에 있다.

## 실행 결과

| 검증 | 결과 | 증거 |
|---|---|---|
| TypeScript, Vite 프로덕션, PWA 서브경로 | PASS | `web-build.log`, `Web/` |
| Vitest | 11 PASS | `unit.log`, Markdown 변환·경로·ZIP·IndexedDB |
| Playwright Chrome | 11 PASS | `chrome.log`, `chrome-results.json` |
| Playwright Edge | 1 PASS | `edge.log`, 서브경로 오프라인 재열기 |
| Rust 로컬 저장 테스트 | 3 PASS | `rust.log` |
| Tauri release 및 Windows x64 NSIS | PASS | `windows-build.log`, `Windows/` |
| Windows WebView2 앱 실실행 | PASS | `windows-smoke.log`, `windows-workspace.png` |
| npm 감사 | 알려진 항목 0건 | `npm-audit.json`, 실행일 기준 |
| 공식 BI PNG | 원본 SHA-256 2건 일치 | `pdf-and-brand-check.json` |

## 명세의 인수 시나리오

| ID | 상태 | 실행 환경 및 증거 | 미검증 범위 |
|---|---|---|---|
| E2E-01 | PASS | Chrome에서 중첩 폴더, 문서·폴더 드래그 이동, 삭제·복원, 재열기 및 첨부 확인. Rust에서 실제 Markdown과 첨부 이동 확인. | Windows UI의 모든 CRUD 조합 |
| E2E-02 | PASS | Vitest에서 H1~H6, 표 2개, 체크박스, 코드, 링크, 이미지와 캡션을 2회 왕복. Chrome에서 시각적 편집과 원문 전환 확인. | 편집 지원 범위 외의 확장 Markdown |
| E2E-03 | PASS | Chrome CDP 조합 이벤트로 한글 1,000자 입력 후 저장·재열기 일치. | Windows OS IME, Android/iOS 가상 키보드 실기기 |
| E2E-04 | NOT RUN | Chrome/Edge 390px 터치 에뮬레이션에서 오프라인 사진 3장, 한글 300자, 표 2개 및 재열기 확인. | Android Chrome과 기기 카메라 실측 |
| E2E-05 | NOT RUN | Web/PWA 빌드·카메라 입력·파일 선택 경로 제공. | iOS Safari 및 홈 화면 PWA 실기기 |
| E2E-06 | PASS | 단위 검사에서 문서 10개, 사진 20개, 상대경로 및 SHA-256 확인. Chrome에서 ZIP 다운로드 후 복원 확인. | 192 MiB 한도에 가까운 ZIP의 모바일 반복 복원 |
| E2E-07 | PASS | Chrome PDF의 페이지 번호, 한글, 표 2개, 코드 및 이미지 3개 확인. WebView2에서 PDF 파일 생성. | 사용자 실제 인쇄 화면의 저장 대상 선택, iOS·Android 인쇄 동작 |
| E2E-08 | PASS | Chrome·Edge에서 네트워크 차단 후 서비스 워커로 재실행 및 저장 확인. | 모바일 OS의 장기 캐시 회수 정책 |
| E2E-09 | PASS | Chrome에서 저장 한도 오류 주입 후 초안 보존·재시도 성공. Rust에서 외부 변경 충돌 시 원본 보존. | 물리적인 디스크 가득 참, 읽기 전용 폴더 전체 사용자 흐름 |
| E2E-10 | PASS | 경로 검사에서 상위·절대 경로, Windows 예약 경로, ZIP 심볼릭 링크와 과도한 압축 비율 차단. | OS 권한이 있는 외부 프로세스의 동시 파일 경로 변경 |
| E2E-11 | PASS | Chrome에서 원문 보존, HTML·스크립트 미리보기 차단, 원격 이미지 대체 텍스트 확인. | 별도 외부 보안 감사 |
| E2E-12 | PASS | 이동 이후 한국어 제목·본문 검색, Windows 파일 외부 변경 감지·재실행 확인. | 1GB 첨부 라이브러리 동반 부하 시험 |
| E2E-13 | PASS | 로컬 정적 서브경로에서 새로고침, manifest, 서비스 워커 scope 및 캐시 작동 확인. | 실제 GitHub Pages 게시 URL, 설치 버튼·홈 화면 등록 실기기 |
| E2E-14 | PASS | 실제 저장 성공·실패 상태, 문서·폴더 드래그, 1440/1024/390px 레이아웃 및 모바일 탐색 Esc와 포커스 복귀 확인. | 전체 키보드·스크린리더 접근성 평가 |
| E2E-15 | PASS | Chrome 시스템 reduced-motion에서 애니메이션 감소 상태 확인. | 기기별 프레임 드롭 계측 |
| E2E-16 | PASS | 원본 PNG 2개 체크섬, Workspace 전용 심볼과 시작 화면 모션 확인. | 저전력 기기 실제 성능 |
| E2E-17 | PASS | 약 2.20 MB PNG 3장 저장 후 편집과 재열기 검사. 해당 실행의 저장 및 프레임 계측값은 `chrome-results.json`에 포함했다. | 저사양 모바일 평가, 1GB 첨부 스트레스 테스트 |

1,000개 합성 문서의 한국어 부분문자열 검색을 15회 측정했다. 앱 검색 함수의 중앙값은 6.44ms, 최댓값은 9.05ms였다. 실제 작업공간 열기, UI 렌더, SQLite 재색인 및 1GB 첨부 로드는 포함하지 않았다.

## 리디자인 검수

- 첫 화면, 데스크톱 편집기, 태블릿 문서 정보 패널, 모바일 편집기를 렌더링해 `QA/redesign-*.png`로 기록했다. 저장 상태와 원문 전환, 체크리스트 줄 정렬 및 Markdown 표를 검증했다.
- 앱 전용 심볼은 회사 BI 원본과 구분했다. 원본 PNG 두 파일은 `public/brand/`에 보존하며 설정에서 볼 수 있다. Geist 및 Geist Mono의 OFL 파일은 `public/licenses/`에 포함했다.

## 미구현 및 후속 검증

- GitHub Pages 실배포는 저장소를 지정한 후 진행한다. 배포 워크플로와 서브경로 빌드가 포함되어 있다.
- Windows 설치 프로그램과 실행 파일은 미서명이다. 설치 마법사·제거·업데이트 정책은 대상 기기에서 점검해야 한다.
- V1의 자동 동기화·계정·중앙 저장소는 범위 밖이다. 데이터 이동은 프로젝트 ZIP으로 지원한다. 템플릿·버전 이력·백링크·문서 게시, 전자결재·불변 감사·RAG는 후속 버전 범위다.
- Windows SQLite는 복구·재색인 가능한 메타데이터 및 본문 사본으로 사용한다. 인터랙티브 검색은 양쪽 플랫폼에서 메모리 부분검색이다. SQLite FTS5와 별도의 브라우저 영속 전문검색 인덱스는 미구현이다. Windows 외부 감시는 카탈로그에 이미 등록된 문서를 대상으로 한다. 신규 외부 파일은 가져오기를 사용한다.
- 폴더 이동은 같은 프로젝트 안에서 제공한다. 프로젝트 간 이동은 개별 문서에 적용된다. 터치 화면에서는 작업 메뉴의 이동 명령을 사용한다.
- 시각적 모드에서 HTML·각주·참조형 링크 등의 일부 문법은 원문으로 연결한다. ZIP은 192 MiB, 파일 3,000개 제한이며 압축 해제량과 파일 형식도 확인한다.
- 실제 Android/iOS, Windows 시스템 IME·인쇄 저장 선택, 저사양·1GB 부하, 설치·접근성 종합 평가는 남겨 두었다.

