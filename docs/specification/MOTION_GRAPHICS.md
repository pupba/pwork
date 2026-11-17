# Motion & Motion Graphics System — v1.1

## 1. 범위

**(A) 상태 피드백형 인터랙션:** 클릭, 호버, 저장, 첨부, 이동, 모달, 로딩.  
**(B) 장면형 모션 그래픽:** 앱 Splash, 브랜드 소개/온보딩, 빈 상태, 작업 완료 순간의 미니 일러스트.  
사용자 참조 사이트: https://ui-motion-prompts.pages.dev/ (이 패키지 작성 당시 원본 상세 열람 불가: 참고 URL로만 기록). 선택적 대안 학습: https://motion.dev/examples

유료/저작권 보호된 애니메이션 코드, Rive 파일, GIF를 그대로 가져오지 않는다. 이 ZIP의 `design/motion.css`와 `design/motion-showcase.html`은 독립 작성 예시다.

## 2. 모션 원칙

- **기능 우선:** 저장/오류/완료 상태는 실제 저장 결과와 연결. 로딩이 완료되기 전에 성공 애니메이션 금지.
- **절제:** 반복하는 장식 애니메이션이 텍스트 편집, 표 조작, 사진 미리보기를 방해하면 즉시 제거.
- **일관성:** Motion 토큰의 지속시간, easing, 이동 범위, stagger 규칙을 공유.
- **무해한 BI:** 로고 원본 이미지의 내부 심볼 구조, 노드 위치, 색을 바꾸지 않는다. 기존 이미지를 전체적으로 fade/translate/scale만 한다.
- **기본 reduced-motion:** 시스템 설정 또는 앱 설정에서 모션 축소. 해당 모드에서도 상태 메시지/로더 텍스트는 유지.
- **모바일 최적화:** hover 없음을 전제로 터치 피드백, 불필요한 큰 애니메이션·영상 자동재생 금지.

## 3. Motion Token Initial Values

| 토큰 | 값 | 목적 |
|---|---|---|
| instant | 80ms | 터치 눌림/순간 반응 |
| fast | 140ms | 버튼·아이콘 피드백 |
| normal | 220ms | 메뉴, 토스트, hover |
| panel | 300ms | Drawer/Modal, 섹션 진입 |
| scene | 700ms | 1회 Splash/빈 상태 등장 |
| ambient | 8000ms | 선택적 느린 비집중 배경 반복 |
| ease-out | cubic-bezier(.22, 1, .36, 1) | 등장/완료 |
| ease-in-out | cubic-bezier(.4, 0, .2, 1) | 이동/전환 |
| press-scale | .975 | 버튼 누름 |
| hover-lift | -2px | 카드 강조(데스크톱만) |
| enter-y | 8px | 짧은 진입 |

필요한 경우 개발·QA 성능 측정에 따라 값 조정. Scene은 성능·접근성을 충족하는 화면에 한해 1회 재생.

## 4. 모션 카탈로그 (요건 + 조건)

| ID | 대상/트리거 | 규격 | 예외/QA |
|---|---|---|---|
| MOT-001 | 버튼 hover/focus | 140ms 색/경계 강조, hover에서 2px 이하 lift | 터치 hover 가정 금지 |
| MOT-002 | pointer down/up | scale(.975)→1, 80~140ms | 클릭 대상 면적·텍스트 스케일 과도 변경 금지 |
| MOT-003 | 프로젝트/문서 선택 | 선택 행 배경/indicator 140ms | 선택 실시간 반영; 레이아웃 흔들림 금지 |
| MOT-004 | 자동 저장 시작→성공 | 저장 중 indicator → 실제 durable write 성공 후 check/짧은 부드러운 transition | 완료 전에 성공 처리 금지; 연속 타이핑 시 반복 팝업 금지 |
| MOT-005 | 저장 실패/권한 문제 | 실제 오류 시 짧은 shake 1회 + 명확한 오류 안내 | 내용 보존·재시도 제공; 반복 무한 shake 금지 |
| MOT-006 | 오프라인 전환 | 상태 아이콘/메시지 교체, 220ms 이내 | 로컬 저장과 동기화 대기 상태 구분 |
| MOT-007 | 사진/첨부 드롭·선택 | drag-over 안내, 항목 1회 fade/scale-in; 실제 저장 진행 표시 | 파일 저장 전 첨부 성공 오인 방지 |
| MOT-008 | 모달/드로어 진입·종료 | opacity+translateY 8px, 220~300ms | 포커스·ESC·배경 스크롤 잠금 유지 |
| MOT-009 | 파일 이동·드래그 | 현재 대상 강조, 이동 성공 시 위치 변경 | 오류 시 원위치 및 오류 표시 |
| MOT-010 | 검색 결과 | 빠른 리스트 enter 140~220ms 또는 모션 없음 | 입력 반응성 우선; 결과 많으면 가상화 |
| MOT-011 | Splash / 첫 실행 | **브랜드 원본 이미지 전체**가 fade + translateY(-) + subtle scale 1회, 약 700ms | 스플래시 강제 대기 금지; reduced-motion 즉시 렌더 |
| MOT-012 | 빈 프로젝트 | 브랜드 심볼 전체 조용히 등장 후 정지, CTA 등장 | 무한 반복 애니메이션 기본 금지 |
| MOT-013 | PDF/ZIP 완료 | 출력 완료 시 체크 팝/필요시 아이콘 이동 1회 | 단순 브라우저 print dialog 열림을 PDF 성공으로 표시 금지 |
| MOT-014 | 브랜드 앰비언트 그래픽(옵션) | 화면 배경에 브랜드 블루/인디고 연결점 모티프의 느린 원형 파동, 페이지 장식 | 원본 로고 대체처럼 보이지 않도록 별도 장식 명시, 콘텐츠 뒤, reduced-motion 완전 정지 |
| MOT-015 | 모바일 툴바 활성 | 현재 적용 서식만 highlight/짧은 indicator 이동 | 키보드·IME 입력 중 재배치·스크롤 점프 금지 |

## 5. 모션 그래픽 시퀀스

### MG-01: PRESTIQUE Splash

- 용도: 앱 최초 로드, 버전 업데이트 완료, 온보딩 첫 장면. 매 문서 클릭마다 사용하지 않음.
- 타임라인: 0~150ms 빈/배경 → 150~700ms 로고 전체 fade/scale(.96→1) → 500~800ms 워드마크 전체 fade-in → 본문 앱 준비 즉시 전환. 시간은 **최소 노출 시간 강제 금지**.
- 기기 성능 낮거나 reduced-motion이면 정적 로고만 보여주고 즉시 진행.
- 자산: **사용자 원본** `brand/PRESTIQUE_LABS_Symbol_Original.png`, `brand/PRESTIQUE_LABS_Wordmark_Original.png`.

### MG-02: Empty Workspace

- 용도: 프로젝트 없는 초기 시작.
- 1회 진입: 심볼 전체 translateY(8→0), opacity(0→1); 안내 문구와 CTA 80ms 간격으로 등장.
- 마지막 프레임에서 정지. 키보드 포커스 및 CTA 접근성을 해치지 않음.

### MG-03: Asset Upload Feedback

- 사용자가 사진 촬영/파일 선택 후, 실제 저장이 진행되는 동안 파일 썸네일 opacity/scale 등장 + progress ring.
- 원본 저장 완료 후에만 완료 표시; 실패 시 오류와 재시도 명시.
- 파일 20개 이상 대량 업로드에서 개별 입장 모션 비활성.

### MG-04: Saved State / Document Confidence

- 타이핑 시 조용한 '저장 중' 상태. 실제 파일 저장/DB 트랜잭션 commit 이후에만 체크마크 1회 scale.
- 연속 자동저장에서는 애니메이션 rate limit, 저장 상태 텍스트가 주 정보.
- 저장 실패/디스크 부족/브라우저 quota error일 때는 성공 체크 대신 실패 안내.

## 6. 구현 가이드

- 우선 CSS `transform`과 `opacity`만 애니메이션한다. 레이아웃 유발 `width/height/top/left` 연속 animation 지양.
- 리스트/테이블 수백 행을 화면 전체 stagger하지 말 것.
- 필요한 곳만 DOM/React Motion 라이브러리 도입. 추가 의존성과 번들 크기/성능 근거 기록.
- `document.visibilityState` 감지할 수 있는 환경에서는 숨긴 화면의 앰비언트 그래픽 중지 검토.
- 키보드 포커스 상태는 애니메이션 여부와 무관하게 보이게 하라.
- WebView/Android/iOS Safari에서 실제 성능 확인. `prefers-reduced-motion` 미디어 쿼리 적용.

## 7. 모션 QA

- 60fps 목표(일반적 기기/가벼운 화면에서), 프레임 드롭 계측. 낮은 사양 기기는 degrade.
- 1,000자 연속 IME 한글 입력 중 커서 점프/입력 유실 0건.
- 사진 3장 첨부 중에도 텍스트 입력 반응 확인.
- Reduced motion 설정 변경 후 진입/퇴장·저장·오류가 모두 접근 가능.
- Save success는 실제 저장 완료 이후에만 렌더(의도적 디스크 오류 테스트 포함).
- 정보가 모션만으로 전달되지 않는지 자동화/수동 점검.
