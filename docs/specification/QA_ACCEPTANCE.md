# Quality Assurance / Acceptance Test Plan

## QA 집행 원칙

- V1 기능 요구사항 ID는 `docs/DEVELOPMENT_SPEC_v1.0_ORIGINAL.md`의 WS/DOC/MOB/FILE/PDF/SEARCH/SEC 등을 사용한다.
- 각 E2E 시나리오에 **PASS/FAIL/NOT RUN** 상태, 환경, 검증 산출물(로그/스크린샷)을 남긴다.
- 시각 모션이 작동한다고 저장이 성공했다고 판정하지 않는다. 실제 파일/DB를 재오픈 검증.

## 필수 E2E

| ID | 시나리오 | PASS 조건 |
|---|---|---|
| E2E-01 | 프로젝트 > 하위 폴더 > 문서 생성/이동/삭제/복원 | 경로/본문/첨부 복구 |
| E2E-02 | H1~H6, 표 2개, 체크리스트, 코드, 이미지 → 시각↔원문 2회 왕복 | 의미적 콘텐츠·상대 링크 보존 |
| E2E-03 | 한글 IME 1,000자 입력 + 자동 저장 + 재시작 | 글자 유실/중복/커서 점프 없음 |
| E2E-04 | Android Chrome 오프라인, 사진 3장+300자+표 | 종료/재열기 후 동일 데이터 |
| E2E-05 | iOS Safari/PWA 오프라인과 사진 첨부 | 권한/저장 동작/예외 적절 처리 |
| E2E-06 | 문서10/이미지20 프로젝트 ZIP export/import | 파일 수·문서 내용·SHA256·링크 정합성 |
| E2E-07 | PDF: 한글, 표, 이미지, 코드 블록, 페이지 번호 | 깨짐/본문 유실 없음(기기별 QA) |
| E2E-08 | Chrome/Edge 앱 실행 중 네트워크 끊기 | 기존 캐시를 통한 앱 실행·로컬 저장, 오류 안내 |
| E2E-09 | 저장소 용량 초과/디스크 읽기 전용 | 오류 표시, 미저장 내용 보전/복구 안내 |
| E2E-10 | ZIP 파일에 `../`, 절대경로, symlink, 폭탄성 압축 | 차단·대상 폴더 밖 쓰기 없음 |
| E2E-11 | Markdown HTML/script/svg 이벤트 핸들러 주입 | 렌더링 XSS 미발생 |
| E2E-12 | 문서/프로젝트 검색 + 이동 후 다시 검색 | 정확한 결과/인덱스 재구축 |
| E2E-13 | GitHub Pages 새로고침/서브경로/manifest | 정상 로딩, 비공개 샘플 데이터 유출 0 |
| E2E-14 | UI click/save/error/overlay 모션 | 실제 상태 연동, 키보드/터치 정상 |
| E2E-15 | reduced-motion 시스템 설정 | 정보 손실 없이 모션 감소 또는 제거 |
| E2E-16 | Splash/빈 상태 로고 원본 | 그래픽 원형 유지, 강제 대기 없음 |
| E2E-17 | 큰 첨부파일/장문 편집 | UI 입력 끊김 심하지 않음, 복구 가능 |

## 비기능 목표 (초기 QA 예산; 실측 필요)

- 일반 사무 노트북·모바일에서 핵심 입력/버튼 클릭 지연이 체감되지 않을 것. 목표 이벤트 처리 <100ms, 저장은 비동기 처리.
- 1,000개 문서 예제에서 검색 중앙값 300ms 이내 목표(환경 명시).
- 저장 자동 트리거 사용자가 조절 가능한 약 0.5~1.5초 디바운스, 종료/백그라운드 시 best-effort flush.
- 일반적인 단순 UI 모션 60fps 목표, 저성능 환경에서 효과 자동 저하.
- a11y: WCAG 2.2 AA 목표, 키보드 포커스/semantic ARIA/모달/대비/reduced motion 점검.
- 테스트에는 fixture를 사용; 실제 회사 비공개 자료 업로드 금지.

## 테스트 산출물

1. Unit: Markdown serializer/parser roundtrip, repo CRUD, import path validate, metadata migration.
2. Integration: IndexedDB persistence, attached Blob, zip import/export, desktop file adapter.
3. E2E: Playwright browser, 가능하면 Tauri integration/manual smoke, 실제 모바일 체크리스트.
4. Security: XSS, path traversal, ZIP size limits, CSP, secret scanning, dependency audit.
5. Visual/UX: 스크린샷 검토, 3가지 화면폭, Reduced-motion 캡처, 실제 업로드/저장 피드백.

## 품질 결과 기록 형식

```markdown
| Test ID | 상태 | 실행 환경 | 증거 | 결함/차단 요인 |
|---------|------|-----------|------|----------------|
| E2E-01  | PASS | Win11/Tauri | tests/report/e2e-01.png | - |
```
