# Architecture and Architectural Decisions

## 실행 환경/저장소 비교

| 실행 환경 | UI 앱 코드 | V1 원본 저장 | 제한 |
|---|---|---|---|
| Windows PC | Tauri 2 + React 19 + Astryx | 사용자가 지정한 폴더의 실제 `.md` + assets; SQLite 검색/메타 | WebView/FS 권한, PDF OS 차이 |
| Desktop 브라우저 | Vite Static SPA/PWA | IndexedDB 내 canonical MD 문자열·첨부 Blob | PC 파일 시스템 직접 접근은 명시적 선택/브라우저 제한 |
| Android/iOS | HTTPS PWA | IndexedDB·캐시 + 명시적 ZIP 백업 | 브라우저 저장소 회수·카메라 API 차이 |
| V2 | 자체 서버/클라우드 스토리지 | 서버/디바이스별 revision·첨부·메타 | 인증/충돌·암호화/비용 필요 |

## 모노레포 구조 (Work가 생성)

```text
prestique-workspace/
  apps/
    web/                # React + Vite + PWA, pages 배포
    desktop/            # Tauri 2 shell + fs/db plugins
  packages/
    domain/             # 문서/프로젝트 모델, 프런트매터, serializers
    editor/             # Tiptap, CM6 + roundtrip tests
    storage/            # Repo interface, browser, desktop adapters
    ui/                 # Astryx theme, app-specific controls, motion
    export/             # Markdown/ZIP/PDF helpers
  tests/
  docs/
```

## Data flow

```text
[React UI + Astryx]──[Tiptap/CodeMirror]
          │                │
          └──[Document Service / Markdown serializer]
                          │
                 [Repository Interface]
                  /                 \\
      [Tauri File Repo]       [IndexedDB Repo]
      MD+assets, SQLite       MD+Blob/metadata
                  \                 /
                   [Future Sync API]  (V2, not V1)
```

## ADR-001 — Canonical document = Markdown

- 선택: UTF-8 Markdown + 상대경로 assets. YAML frontmatter with stable UUID. SQLite는 재구축 가능한 인덱스.
- 이유: 데이터 소유권, 상호운용성, 손상 복구 가능.
- 조건: WYSIWYG 서식 변환 시 손실 가능성이 있는 블록은 지원하지 않거나 명확히 경고.

## ADR-002 — GitHub Pages는 앱만 정적 호스팅

- 공개 Git repo에는 **소스 앱/예제 데이터/브랜드 자산**만 포함할 수 있으나 사내 문서/실제 파일은 포함 금지. 필요한 경우 브랜드 자산 외부 공개 범위는 회사 정책에 따름.
- 기기 간 자동 동기화는 V1에 없음. PWA는 사용자 브라우저 저장소로 동작.
- GitHub Pages 프로젝트 사이트(`/repo-name/`)와 사용자/조직 사이트(`/`)의 `base` 경로/manifest scope 차이 점검.

## ADR-003 — React 19 + Astryx

- 공식 2026-11-17 README 기준 React 19+ peer dependency, StyleX로 작성된 컴포넌트의 CSS 사전 빌드 제공, 테마 CSS 변수 커스터마이즈.
- 베타 의존성 변경 위험: 버전 고정, 최소 기능 래퍼 구성, 업그레이드 테스트.

## ADR-004 — Tiptap/CodeMirror 병용

- Tiptap: 모바일 WYSIWYG, 기본 Markdown 지원 기능 범위 검수.
- CM6: Markdown 원문 편집.
- 두 편집기는 한 번에 하나의 canonical state/저장 경로를 사용, 모드 전환 시 serialize/parse 검증.

## ADR-005 — 모션 독립 계층

- UI 비즈니스 이벤트 발생 → 실제 상태 업데이트 → 성공/오류 이벤트 → motion layer 반응.
- 로컬 저장은 비동기/실패 가능. 애니메이션 콜백에서 저장 성공을 가정하지 않음.
- 기능과 시각적 표현 분리. `prefers-reduced-motion` 우선.

## ADR-006 — Cloud/권한/감사 분리

- V2: 사용자 인증, 리비전·충돌과 스토리지 비용. V3: 결재 완료 문서 원본 불변성과 감사 로그를 별도 아키텍처로 구현.
- 단순 로그 파일이나 한 PC의 SQLite만으로 불변 감사 보장 불가. 독립 감사 저장소/서명/외부 WORM 등 검토 필요.

## 도입 전 Spike 필수

1. Astryx+Vite+Tauri 빌드/타입/스타일 호환.
2. Tiptap Markdown(표/체크박스/이미지/코드) 왕복.
3. Tauri Windows PDF 인쇄/저장.
4. Chrome/Edge/Android/iOS Safari indexedDB offline photo persistence.
5. ZIP streaming, 대용량 사진·압축 해제 보안.
