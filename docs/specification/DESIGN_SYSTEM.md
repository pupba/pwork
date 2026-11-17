# PRESTIQUE LABS — Design System Specification

## 디자인 철학

- 성격: B2B 연구·데이터·문서 생산성 소프트웨어. **차분하고 정확하며, 밀도 높은 정보를 읽기 쉬운 미니멀/모던 UI**.
- 원칙: Astryx 기반 일관성, 로컬 우선 저장 상태의 명료함, 회사 BI 존중, 업무 흐름의 낮은 방해.
- 벤치마크: Astryx의 접근성·구성/테마 아키텍처. Notion/Obsidian은 제품 사용 패턴 참고이지 동일 외형 복제 대상이 아님.

## BI 에셋 매핑 (절대 원본 유지)

| 에셋 | 정확한 위치 | 쓰임 | 금지 |
|---|---|---|---|
| 공식 심볼 | `brand/PRESTIQUE_LABS_Symbol_Original.png` | 앱 아이덴티티, 앱 소개, 로딩/빈 상태, 온보딩 | 노드 재배치, 색상 교체, 임의 SVG 재그림 |
| 공식 타이포그래피 | `brand/PRESTIQUE_LABS_Wordmark_Original.png` | 앱 로그인/설정/About, 표지 등 공간이 충분할 때 | 폰트 역산, 자간 임의 재제작, 임의 로고 추적 |

- 두 에셋 모두 **배경 투명 RGBA PNG**이며 원본 해상도는 심볼 1254×1254, 타이포그래피 2048×682.
- 워드마크의 어두운 문자와 블루/그레이 심볼이 밝은 배경에서 자연스럽게 보인다. 다크 테마에서는 워드마크 이미지를 무조건 반전시키지 말고 **밝은 보호 컨테이너**를 사용하거나 명도 대비를 확인한 변형본을 **별도 승인 후** 제작한다.
- 로고에는 `object-fit: contain`, 비율 유지, 너비/높이 동시 강제 왜곡 금지.
- 앱 이름은 `PRESTIQUE Workspace`, 제작사/사업 주체는 `PRESTIQUE LABS`.

## Astryx 적용

- 공식: https://github.com/meta/astryx · Docs https://astryx.atmeta.com · Storybook https://astryx.atmeta.com/storybook/
- 2026-11-17 확인 README: React 19+, `@astryxdesign/core`, `@astryxdesign/theme-neutral`, Theme Provider, CSS 변수 기반 커스터마이징, MIT, 베타.
- UI 기본 컴포넌트: Button, Input, Select, Dialog, Menu, Tooltip, Tabs, Form, Table, Toast, Navigation/Sidebar 등 실제 배포된 목록에서 사용 가능 여부 확인 후 선택.
- 기본 기능은 Astryx 제공 컴포넌트를 우선하고, 파일 트리·문서 에디터·편집 커맨드 바 같은 제품 특화 컴포넌트만 직접 작성.
- 앱의 업무 로직은 특정 Astryx UI 컴포넌트에 결합하지 말고 prop adapter 레이어로 분리.
- 색상은 `design/tokens.css` CSS 변수를 앱과 Astryx Theme에 매핑.

## 테마 토큰 초안

> 아래 HEX는 **업로드 PNG에서 관찰된 색상에 근거한 초기 구현 제안**이지 정식 CI 컬러 스펙 확정값은 아님. 별도 BI 가이드 수령 시 재확정.

| 역할 | 기본값 | 의미 |
|---|---|---|
| `brand-primary` | `#3B5DF4` | 선명한 블루 강조/선택 |
| `brand-indigo` | `#191AAC` | 심볼의 진한 인디고 |
| `brand-slate` | `#4D596A` | 심볼 그레이/보조 |
| `ink-primary` | `#151B26` | 텍스트/선 |
| `surface-base` | `#FAFBFD` | 앱 배경 |
| `surface-raised` | `#FFFFFF` | 문서/패널 표면 |
| `border-subtle` | `#E4E8EF` | 분리선 |
| `state-success` | `#168568` | 완료 상태(브랜드 색 아님) |
| `state-danger` | `#BC3442` | 오류 상태(브랜드 색 아님) |

- 색상은 **목적을 나타내는 의미 토큰**으로만 사용. 성공=브랜드 블루로 처리해 혼동시키지 않기.
- 타이포그래피: 워드마크는 이미지. 본문은 라이선스 검증된 한국어 sans 또는 시스템 폰트; H1~H6/표/코드/캡션 유형을 분리.
- 정보 밀도가 높은 제품이므로 한 화면의 본문 줄 길이, 최소 버튼 터치 영역, 코드 대비, 표 가로 스크롤 정책을 테스트.
- Desktop: 폴더 탐색·에디터·선택형 우측 메타 패널. Tablet: 폴더 탐색 전환. Mobile: 에디터/탐색 집중 보기. **픽셀 고정치나 화면 레이아웃은 디자인 리뷰로 조정 가능**, 기능은 유지.

## 필수 상태와 UI 명확성

| 상태 | 필수 표현 | 모션 연계 |
|---|---|---|
| 미저장/저장 중 | 실제 저장 진행 중임을 표시 | MOT-004 |
| 저장 완료 | 영속 저장 성공 이후만 성공 표시 | MOT-004 |
| 저장 실패 | 실패 원인/복구 동작, 내용 보존 | MOT-005 |
| 오프라인 | 현재 기기에 저장된다는 점 설명 | MOT-006 |
| 외부 변경 충돌 | 원본/내 수정 비교·선택 | MOT-009 |
| 사진 첨부 | 미리보기/용량/성공/실패 | MOT-007 |
| 빈 프로젝트 | 빈 상태 설명과 신규 작성 | MOT-012 |

## 모션 디자인 분리

- 코드의 `design/motion.css`는 기본 시작점. 세부 요건은 `docs/MOTION_GRAPHICS.md` 기준.
- 원본 BI를 직접 수정하지 않으며, 로고를 포함한 **레이어/전체 요소**의 opacity/translate/scale만 허용.

## 화면 구성 목록

1. 첫 실행/워크스페이스 생성·열기.
2. 프로젝트 탐색기(폴더 트리, 즐겨찾기, 휴지통).
3. 문서 편집 화면(시각적/원문/분할 보기, 모바일 툴바).
4. 이미지·파일 첨부 모달 및 저장 상태.
5. 통합 검색·문서 이동/링크.
6. PDF 출력 설정 및 미리보기.
7. 프로젝트 ZIP 백업/복구 및 실패 복구.
8. 설정, 저장소 사용량, 앱 정보, 접근성 설정.

## 접근성 기준

- WCAG 2.2 AA 목표. 키보드 탭 이동, 포커스 링, 스크린리더 이름, 모달 focus trap, 충분한 터치 타깃, 명도 대비 검토.
- `prefers-reduced-motion: reduce` 시 이동 애니메이션 제거·전환시간 최소화, 상태 전달 자체는 유지.
- 모션은 색상만으로 상태를 전달하지 않음. 텍스트/아이콘·ARIA 상태 함께 사용.
