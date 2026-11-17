# Implementation Roadmap and Work Gates

> Work는 매 단계 **실행 가능한 코드와 테스트 증빙**을 남긴다. 시간 추정치는 환경에 따라 달라지므로 여기서는 범위·게이트만 정의.

## P0 — 기반 / Spike

- React 19 + Vite + TypeScript + Astryx + Theme + CSS + motion 레이어 로드.
- 실제 원본 로고 2개 반영, 반응형 최소 Shell과 저장 상태 구현.
- Tiptap Markdown/CodeMirror/한글 IME/표·체크박스·이미지 serialize 시험.
- Repo interface·공통 Document 모델 작성, 위협 모델·CSP 기본 설정.
- **게이트:** 앱 실행, Astryx import, 기본 문서 샘플 왕복 PASS.

## P1 — Web/PWA Local First

- 워크스페이스/프로젝트/폴더/문서 CRUD, IndexedDB 영속성.
- 모바일 WYSIWYG, 직접 카메라·갤러리 첨부(일반 파일 선택 fallback), 이미지 Blob 저장.
- 자동 저장(성공/실패 구분), 목록·검색, 휴지통, 프로젝트 ZIP/Markdown import/export.
- 브라우저 인쇄 PDF + PWA/manifest/offline shell + GitHub Pages `base`.
- **게이트:** E2E-01~04,06~09,11~13, 모바일 실기기 계획.

## P2 — Windows Tauri Local Files

- 사용자 지정 워크스페이스 디렉터리, 실제 `.md` 파일/attachments atomic write, SQLite index.
- PWA와 동일 도메인/에디터 공유. 파일 외부 변경 감지, 수동 reindex.
- PDF Windows WebView 동작 검증, 배포 패키징, 마이그레이션.
- **게이트:** desktop E2E-01~03,06~07,09,12 및 실행·빌드 지침.

## P3 — Brand Polish and Motion Graphics

- Astryx 컴포넌트 적용 범위 확대, 색/명암/모바일/다크 테마 검수.
- MOT-001~015 중 P0 우선, P1 모션은 기능 게이트 이후 적용.
- 독립형 브랜드 Splash, 빈 프로젝트, 첨부/저장 완료 모션(사용자 동작 연결).
- Reduced-motion, IME/사진 작업 성능, 저사양 성능 테스트.
- **게이트:** E2E-14~17, 원본 로고 변형 없음.

## P4 — Hardening / Release

- 테스트·성능·보안·접근성·데이터복구, GH Pages 배포/Windows 패키징.
- 배포 리포트(실행 명령, 공개/비공개 경계, 미해결 이슈, 알려진 한계).
- 버전/태그/테스트 결과 기록, 배포물 SHA-256.

## P5 — 후속 로드맵 (구현하지 말고 설계 준비)

- V1.5 템플릿/문서 버전/내부 링크/정적 **문서** 게시.
- V2 서버/클라우드 동기화(분산 충돌/인증/암호화).
- V3 사내 권한/전자결재/불변 감사.
- V4 RAG/AI 검색·에이전트.

## 결정/변경 기록 방식

각 결정은 `docs/decisions/ADR-XXX.md`에 상태/맥락/선택/대안/결과를 남긴다. 변경이 기능 요구를 축소하면 사용자에게 명확히 표시.
