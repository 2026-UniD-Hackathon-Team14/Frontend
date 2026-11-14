# 모아 프런트엔드 파일 구성

`test.html`을 브라우저에서 직접 열면 됩니다. 별도 빌드 과정은 없습니다.

## CSS

`style.css`는 스타일 파일을 순서대로 불러오는 진입점입니다.

- `css/base.css`: 색상 변수, 기본 글꼴, 요소 기본값
- `css/sidebar.css`: 전체 화면 틀, 사이드바, 워크스페이스, 프로필
- `css/avatars.css`: 팀원 아바타와 색상
- `css/header.css`: 상단 헤더, 팀원 목록, 공통 버튼
- `css/chat.css`: 채팅 영역, 메시지, 입력창
- `css/board.css`: 합의 보드와 필터
- `css/dialog.css`: 의미 확인 모달, 입력 필드, 토스트
- `css/responsive.css`: 화면 크기별 대응과 채팅방 상단 버튼 스타일

## JavaScript

`test.html`의 스크립트 순서는 공통 파일 → 기능 파일 → `script.js`입니다.
로컬 HTML 실행을 지원하기 위해 일반 스크립트를 사용하며 공통 상태와 함수를 공유합니다.

- `js/utils.js`: DOM 선택과 HTML 이스케이프
- `js/state.js`: 자료조사 채팅 상태
- `js/toast.js`: 안내 메시지 표시
- `js/chat.js`: 채팅 렌더링, 전송, 입력 이벤트
- `js/meaning.js`: 의미 선택과 모달 이벤트
- `js/sidebar.js`: 워크스페이스 및 모바일 메뉴
- `js/board.js`: 빈 합의 보드의 필터 선택
- `script.js`: 각 기능 초기화

합의 카드 생성은 아직 구현하지 않았으며 보드는 빈 상태로 시작합니다.
