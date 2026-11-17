# PRESTIQUE Workspace — Agent Instructions

이 파일은 ChatGPT Work / 코딩 에이전트의 최상위 작업 지침이다.

## 원본과 우선순위

1. 사용자 요구: PRESTIQUE 전용 로컬 우선 문서·프로젝트 관리 앱; Markdown 및 모바일 WYSIWYG; 이미지·PDF; 정적 웹/PWA; 향후 동기화.
2. 기능·저장·보안: `docs/DEVELOPMENT_SPEC_v1.0_ORIGINAL.md`.
3. 신규 추가/모호성 해소: `docs/PRODUCT_SCOPE_ADDENDUM.md`.
4. 디자인: `docs/DESIGN_SYSTEM.md`, 모션: `docs/MOTION_GRAPHICS.md`.
5. 검수: `docs/QA_ACCEPTANCE.md`. 기능 충돌 발견 시 사용자 가정이 아닌 `docs/WORK_PLAN.md`의 최소 안전 구현을 우선하고 결정사항을 ADR로 기록.

## 실행 지침

- 사용자가 요청한 **실제 구현**을 수행하라. 단순 구현 계획서나 목업으로 끝내지 마라.
- 구현 전 공개된 Astryx 패키지/문서를 확인하고, **React 19 + Astryx**를 우선 선택하라. 베타 호환 문제가 있으면 원인·재현 로그를 남기고 임시 fallback을 기록하라. 패키지 버전은 lockfile로 고정.
- 저장의 단일 진실원천을 일관되게 설계하라. 데스크톱은 Markdown 원본+첨부, 웹은 IndexedDB에 Markdown canonical representation+첨부 blob을 저장한다.
- 공통 domain/스토리지 인터페이스를 둬서 플랫폼 간 코드 중복을 줄이고 미래 sync adapter를 열어둬라.
- 모바일 편집은 Markdown 문법을 입력하지 않아도 되게 하되 `.md` round-trip 회귀 테스트를 필수로 실행하라.
- 원본 BI PNG를 직접 사용하고 SVG로 임의 재구성·색 변경하지 마라. UI 컬러/모션 토큰만 가변 설정.
- 멋있는 애니메이션보다 접근성, 편집 입력 지연, 저장 무결성을 우선하라. `prefers-reduced-motion` 보장.
- 예시 데이터만 포함한다. 실제 기업문서/이미지/API 키·연락처/원본 연구자료를 GitHub Pages나 git repo에 넣지 마라.
- 네트워크/로그인이 없어도 V1 필수 기능이 동작하게 하라. 브라우저 스토리지는 OS/브라우저에 의해 삭제될 수 있음을 고지하고 ZIP 백업을 지원하라.
- Markdown 파일 저장·ZIP import/export, 링크 상대경로, XSS/Zip Slip, 첨부 경로 탐색 취약점을 테스트하라.
- Electron/Next.js/DB 클라우드 기반으로 무단 전환하지 마라. 반드시 변경 이유와 ADR를 남길 것.
- 기능을 허위 완료 표시하지 마라. 동작, 테스트, 스크린샷/증빙, 제한사항으로 완료를 판정하라.

## 최종 제출 조건

- 실제 개발 저장소, `README.md`, `.env.example`(필요할 때), lockfile, 실행 명령.
- 실행 가능한 Web/PWA와 Windows Tauri 개발·패키징 절차; 환경 제약상 빌드하지 못했다면 분명히 구분.
- E2E/단위 테스트 및 실패·미완료 목록, 주요 화면 모바일/데스크톱 검증.
- 보안 주의사항, GitHub Pages 설정 문서, 후속 버전 백로그.
