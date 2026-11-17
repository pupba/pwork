# Release & Deployment Specification

## GitHub Pages (V1)

- Pages에는 **정적 Web/PWA 앱 파일만** 배포한다. 개발 중 샘플 문서는 가짜 값만 사용.
- `vite.config`의 `base`는 repo site일 때 `/<repo-name>/`, 사용자/조직 site일 때 `/`로 설정.
- SPA fallback/route: Pages에서는 deep link 새로고침이 깨질 수 있으므로 `HashRouter` 또는 안전한 fallback 전략을 선택.
- service worker/manifest의 `start_url`, `scope`, cache path가 base에 맞아야 함.
- 커스텀 도메인 HTTPS와 Cache-Control/업데이트 전략, installability 점검.
- 외부 API token은 클라이언트 bundle에 저장하지 않음. 공개 Pages는 로그인/클라우드 백엔드가 아님.
- 필요시 dev/prod build 분리하고 source map 공개 여부 검토.

## PWA

- installable manifest, 아이콘, service worker(앱 shell cache), 오프라인 로딩.
- IndexedDB의 내용 및 사진 Blob persistence/recovery. Storage quota 예외 설명.
- 정적 앱 최초 방문 이전에 완전 오프라인 이용이 가능하다고 주장하지 않는다.
- 브라우저 저장소 삭제 시 복구를 위해 ZIP 백업 안내 및 다운로드.

## Tauri 2 Windows

- Windows native build 요구 의존성 확인 후 Tauri shell 구성. JS와 Rust plugin 버전 고정.
- 기본 파일 접근 범위 제한, atomic write와 실패 복구, 스토리지 import/export 테스트.
- Windows WebView PDF 차이는 실제 검수. 설치/업데이트 서명 정책은 회사 인증서 준비 후 적용.
- 빌드 산출물은 버전/해시/릴리즈 노트 포함.

## 환경·CI

- Build/Unit/E2E/Lint/Types/Security audit 단계.
- PR에는 비밀키/실제 고객·연구 데이터/미공개 계약·로그 노출 방지.
- CI에서 `npm/pnpm audit`, lockfile 유효성, zip export tests, reduced-motion stylesheet checks.
- 버전 및 release tags 유지, rollback 가능한 build artifacts.
