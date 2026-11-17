# 빌드와 배포

## 웹

```powershell
npm ci
npm run typecheck
npm test
$env:VITE_BASE_PATH='/prestique-workspace/'
npm run build
npm run preview -- --port 4173
```

로컬 검증 주소는 `http://127.0.0.1:4173/prestique-workspace/`이다. 사용자·조직 사이트 루트에서는 `VITE_BASE_PATH=/`로 지정한다. 다른 저장소 사이트에 배포할 때는 그 저장소의 경로로 **다시 빌드**한다. `dist/`의 파일만 호스팅한다. 파일 URL로 직접 열면 서비스 워커 설치와 DB 초기화 조건이 달라질 수 있어 정적 서버를 사용한다.

프로덕션에서 앱 최초 접속 후 서비스 워커 설치가 끝나면 오프라인으로 실행할 수 있다. 배포 시 `index.html`, `sw.js`, `manifest.webmanifest`는 불필요한 장기 캐시를 피하고 해시가 붙은 자산은 장기 캐시에 둘 수 있다.

## GitHub Pages

1. 회사 문서·백업·SQLite·실험 첨부·비밀정보를 제외하고 `Source/` 내용만 GitHub 저장소에 추가한다.
2. 저장소의 Settings → Pages → Build and deployment → Source를 **GitHub Actions**로 설정한다.
3. `Deploy PWA` 워크플로를 수동 실행한다. 입력 `base_path`가 비어 있으면 저장소 사이트 경로를 사용한다. 루트 호스팅은 `/`를 직접 지정한다.
4. 공개 주소에 접속해 강제 새로고침, 개발자 도구의 manifest 범위, 설치 메뉴, 두 번째 오프라인 실행을 확인한다.

## Windows

1. Node.js 22.12+, Rust stable `x86_64-pc-windows-msvc`, Visual Studio C++ Build Tools 및 Windows SDK를 설치한다. WebView2를 확인한다.
2. `npm ci` 후 `npm run tauri -- dev`로 개발 모드를 구동한다.
3. `npm run build:desktop -- -- --locked`로 NSIS 설치 프로그램을 빌드한다. `VITE_BASE_PATH`를 웹 하위 경로로 설정해 두었다면 Windows 빌드 전 제거한다.
4. `cargo test --locked --manifest-path src-tauri/Cargo.toml`로 파일 저장·충돌·휴지통 회귀 테스트를 실행한다.
5. Windows 서명 인증서가 준비되면 NSIS 및 실행 파일의 Authenticode 서명을 별도로 적용하고 인증서 체인과 타임스탬프를 검증한다. 제공 설치 파일은 미서명 빌드다.

## 브라우저 검증

```powershell
npx playwright install chromium
$env:VITE_BASE_PATH='/prestique-workspace/'
npm run build
npm run test:e2e
npm audit
```

시스템 Chrome/Edge를 사용하려면 `PW_EXECUTABLE`에 실행 파일 절대경로를 지정한다. 브라우저 테스트는 합성 자료만 사용한다. 테스트 JSON과 PDF·스크린샷은 `test-results/`에 생성된다. UI 배포 도메인이나 Windows 공개 릴리스 계정은 따로 필요하다.

공식 참고 자료

- [Meta Astryx](https://github.com/meta/astryx)
- [Tauri 사전 요구사항](https://v2.tauri.app/start/prerequisites/)
- [GitHub Pages의 Actions 배포](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

