> 업데이트 (2026-11-15): 최신 배포 Swagger에서 요청한 계약 반영을 확인했으며 프론트 연동도 적용했습니다. 아래의 미지원/임시 처리 설명은 요청 당시의 기록입니다. 현재 카드 이의제기와 즉시 확정 결산은 활성화되어 있고, 채팅은 원문을 유지한 채 analysisId·intentSelections·clientMessageId를 전송합니다. 실제 배포 검증 기준은 tests/openapi.json입니다.
# 표현별 의도 선택 · 직접 입력 API 변경 요청

## 배경과 현재 상태

현재 프론트는 문장 내 모호 표현마다 뜻을 선택하고, `OTHER`이면 직접 입력하도록 변경되어 있습니다. 모든 표현의 선택과 필수 입력을 완료한 뒤 최종 전송합니다.

2026-11-15 조회한 배포 Swagger의 `MessageSendRequest`에는 `text`, `selectedIntent`, `sendOriginal`만 있습니다. 분석 응답은 여러 `expressions`를 반환하지만 전송 API는 메시지 전체의 단일 의도만 받으므로 표현별 선택을 보존할 수 없습니다.

현재 임시 처리:
- 표현 하나의 일반 후보 선택: 기존 `selectedIntent`로 전송.
- 여러 표현 선택 또는 직접 입력: 원문 아래에 선택한 뜻을 설명으로 덧붙인 미리보기를 보여주고, 그 전체를 `text`로 전송. `selectedIntent=null`, `sendOriginal=false`.
- 따라서 서버의 `originalText`에도 설명이 포함됩니다. 아래 계약 적용 후 이 임시 처리를 제거해야 합니다.

**아래 필드와 동작은 제안 계약이며, 현재 배포된 API라고 가정하면 안 됩니다.**

## 1. 분석 API: 표현과 후보에 안정적인 ID 추가

`POST /api/rooms/{roomId}/messages/analyze`

인증: `X-User-Id`. 요청은 기존 `{ "text": "..." }` 유지.

응답 예시 (실제 한국어 문장은 생략하고 위치 검증이 쉬운 예시 사용):

```json
{
  "success": true,
  "data": {
    "analysisId": "analysis-abc",
    "ambiguous": true,
    "expressions": [
      {
        "expressionId": "expr-1",
        "phrase": "maybe Sunday",
        "start": 0,
        "end": 12,
        "candidates": [
          { "candidateId": "candidate-1", "intent": "ACCEPT", "label": "일요일까지 맞출 수 있어요" },
          { "candidateId": "candidate-2", "intent": "REJECT", "label": "일요일까지는 어려워요" },
          { "candidateId": "candidate-3", "intent": "OTHER", "label": "다른 뜻이에요" }
        ]
      },
      {
        "expressionId": "expr-2",
        "phrase": "if possible",
        "start": 22,
        "end": 33,
        "candidates": [
          { "candidateId": "candidate-4", "intent": "UNDECIDED", "label": "가능 여부를 아직 몰라요" },
          { "candidateId": "candidate-5", "intent": "OTHER", "label": "다른 뜻이에요" }
        ]
      }
    ]
  },
  "error": null
}
```

이 응답의 원문은 `maybe Sunday, earlier if possible`입니다.

요구 사항:
- analysisId를 사용자·방·원문과 연결하고 유효기간을 명시해 주세요.
- expressionId는 해당 분석 내에서 유일해야 합니다. 같은 문구가 여러 번 나와도 각각 구분해야 합니다.
- candidateId는 후보의 구체적인 의미를 식별합니다. 동일한 intent enum을 가진 후보가 여러 개여도 구분 가능해야 합니다.
- start/end는 JavaScript 및 Java String과 동일한 **UTF-16 코드 단위**, start 포함/end 제외로 통일해 주세요. 이모지·반복 문구를 포함해 `text.slice(start,end) === phrase`가 성립해야 합니다.
- LLM의 위치 값은 서버에서 검증하고 정정한 뒤 반환해 주세요.
- ambiguous=true이면 최소 1개 표현과 각 표현의 선택 가능한 후보가 있어야 합니다. OTHER 후보도 제공해 주세요.
- 기존 reason 등 필드는 유지 가능합니다.

## 2. 메시지 전송 API: 표현별 선택 배열 지원

`POST /api/rooms/{roomId}/messages`

인증: `X-User-Id`, `Content-Type: application/json`.

```json
{
  "text": "maybe Sunday, earlier if possible",
  "analysisId": "analysis-abc",
  "clientMessageId": "a-client-generated-uuid",
  "sendOriginal": false,
  "intentSelections": [
    {
      "expressionId": "expr-1",
      "candidateId": "candidate-1",
      "customText": null
    },
    {
      "expressionId": "expr-2",
      "candidateId": "candidate-5",
      "customText": "금요일 이전에 전달해 달라는 요청입니다."
    }
  ]
}
```

### 서버 검증 및 저장

- 원문은 **수정 없이 originalText**에 저장합니다. 선택 결과와 직접 입력 내용은 별도 데이터로 저장합니다.
- 분석의 사용자·방·원문과 요청이 정확히 일치해야 합니다. 원문 변경 시 재분석이 필요합니다.
- 모호 표현이 여러 개면 모든 expressionId에 대해 정확히 하나의 선택이 있어야 합니다. 일부 누락, 중복, 알 수 없는 표현/후보 ID는 거절합니다.
- intent와 후보 의미는 candidateId로 서버가 복원합니다. 클라이언트가 보낸 label이나 intent를 신뢰하지 않습니다.
- OTHER 선택에는 trim 후 1~1000자의 customText가 필수입니다. 일반 후보에는 customText를 허용하지 않거나 null만 허용하도록 통일해 주세요.
- 모든 검증이 끝난 뒤 메시지와 선택 결과를 한 트랜잭션으로 저장합니다. 실패 시 부분 메시지를 생성하지 않습니다.
- 번역 재시도/사용자 재전송으로 중복 메시지가 생기지 않도록 clientMessageId를 사용자·방 단위로 유일하게 처리합니다. 같은 키와 같은 요청은 기존 결과 반환, 같은 키와 다른 내용은 충돌 처리합니다.
- 새 형식과 기존 selectedIntent를 동시에 보낸 경우 모호한 우선순위를 두지 말고 400으로 거절하는 것을 제안합니다.

### 일반 메시지와 원문 그대로 보내기

- 분석 결과 ambiguous=false: intentSelections=[] 또는 생략. 기존 일반 메시지 전송을 계속 지원합니다.
- sendOriginal=true: 명시적인 원문 전송 선택입니다. 표현별 선택을 강제하지 않습니다. 선택 데이터는 비어 있어야 하며, 확인된 의도라는 배지를 표시하지 않습니다.
- sendOriginal은 사용자 의도 확인을 생략한다는 의미로, 번역 자체를 생략하는 필드인지 여부와 혼동되지 않게 서버 동작을 명시해 주세요. 현재 수신자의 언어로 읽는 흐름은 유지해야 합니다.

### 제안 오류 코드

| HTTP | code | 프론트 처리 |
| --- | --- | --- |
| 400 | INCOMPLETE_INTENT_SELECTIONS | 빠진 표현 선택 안내 |
| 400 | INVALID_INTENT_SELECTION | 잘못된/중복된 표현·후보 안내 |
| 400 | CUSTOM_INTENT_REQUIRED | 직접 입력 필수 안내 |
| 400 | CUSTOM_INTENT_TOO_LONG | 입력 길이 안내 |
| 409 | ANALYSIS_TEXT_MISMATCH | 원문 재분석 안내 |
| 410 | ANALYSIS_EXPIRED | 재분석 후 다시 선택하도록 안내 |
| 409 | CLIENT_MESSAGE_ID_CONFLICT | 중복 요청 키 충돌 안내 |
| 403 | FORBIDDEN | 방 멤버 또는 분석 소유자 권한 오류 |

공통 응답 wrapper `{ success, data, error: { code, message } }` 유지.

## 3. 번역 처리

서버는 원문 전체와 **각 표현의 선택된 후보 의미/직접 입력 내용**을 함께 번역 모델에 전달해야 합니다.

- 첫 번째 선택만 사용하거나 여러 선택을 단일 ACCEPT/REJECT로 합치면 안 됩니다. 한 문장에 수락과 일정 변경 요청이 동시에 있을 수 있습니다.
- OTHER의 직접 입력을 실질적인 번역 조건으로 사용해야 합니다. enum OTHER만 넘겨서는 의미가 전달되지 않습니다.
- 원문, 선택 의미, 직접 입력은 사용자 데이터로 취급하고 시스템 지시와 분리해 주세요.
- 번역 실패 시 원문과 선택 데이터를 잃지 않아야 합니다. 번역 실패/진행 상태의 응답 정책도 명시해 주세요.
- 확인된 뜻을 설명하는 수신자용 문구 역시 서버가 수신 언어로 제공합니다. 프론트는 임의로 사용자 콘텐츠를 번역하지 않습니다.

## 4. 전송 응답 · 목록 조회 · WebSocket에 선택 결과 반환

다음 세 경로 모두 동일한 의미 데이터를 반환해야 새로고침 전후 표시가 일치합니다.

1. 메시지 전송 성공 응답
2. `GET /api/rooms/{roomId}/messages?lang=en`
3. `/topic/rooms/{roomId}`의 `MESSAGE_CREATED` 이벤트

목록 응답의 메시지 객체 예시 (기존 필드 유지):

```json
{
  "id": 100,
  "senderId": 5,
  "senderName": "Chris",
  "originalText": "maybe Sunday, earlier if possible",
  "originalLanguage": "en",
  "translatedText": "수신 언어로 번역된 전체 문장",
  "createdAt": "2026-11-15T08:00:00+09:00",
  "intentSelections": [
    {
      "expressionId": "expr-1",
      "phrase": "maybe Sunday",
      "start": 0,
      "end": 12,
      "candidateId": "candidate-1",
      "intent": "ACCEPT",
      "label": "일요일까지 맞출 수 있어요",
      "customText": null,
      "displayMeaning": "I can deliver by Sunday."
    },
    {
      "expressionId": "expr-2",
      "phrase": "if possible",
      "start": 22,
      "end": 33,
      "candidateId": "candidate-5",
      "intent": "OTHER",
      "label": "다른 뜻이에요",
      "customText": "금요일 이전에 전달해 달라는 요청입니다.",
      "displayMeaning": "I am asking for delivery before Friday."
    }
  ]
}
```

- displayMeaning은 조회 lang 기준. label/customText는 저장된 원본 의미 데이터입니다.
- WebSocket은 기존 translations 언어별 맵을 유지하고, 각 선택에도 displayMeanings: { ko, en, vi, de }를 제공하거나 수신 즉시 목록 재조회하도록 계약을 정해 주세요.
- 프론트는 원문 토글과 표현별 확인된 뜻을 각각 표시합니다. 전체 문장에 단일 의미 배지를 붙이지 않습니다.
- 분석 임시 데이터가 만료되어도 저장된 메시지의 선택 의미는 남아야 하므로 선택 당시 의미를 스냅샷으로 보관해 주세요.

## 5. 적용 순서

1. 백엔드에서 위 계약 또는 협의된 동등한 계약 구현 및 Swagger 반영.
2. 분석/전송/조회/WebSocket 데이터와 번역 동작 검증.
3. 프론트에서 현재 설명 덧붙이기 처리를 제거하고 intentSelections 전송으로 교체.
4. 수신 메시지를 표현별 의미 배지로 표시하도록 변경.

기존 클라이언트의 단일 selectedIntent는 과도기 호환용으로 유지할 수 있습니다. 단, 복수 표현을 단일 의도로 잘못 저장하는 요청은 서버에서도 막아야 합니다. 기존 설명이 덧붙여진 메시지는 임의로 파싱해 원문/선택 데이터로 추정하지 않고 그대로 보존합니다.

## 6. 검증 시나리오

- 표현 2개 중 1개만 선택: 프론트 전송 불가, 서버 직접 요청도 실패.
- OTHER 선택 후 빈칸/공백만 입력: 전송 불가.
- 일반 선택 + OTHER 입력: 각 의미가 모두 저장·번역되고 원문은 그대로 보존.
- 같은 표현이 두 번 등장하거나 이모지가 앞에 있는 문장: 정확한 표현에 선택값 연결.
- 같은 intent enum의 다른 후보: candidateId별 실제 의미가 구분됨.
- 입력 중 취소/언어 변경/전송 실패: 프론트 선택과 입력 손실 없음.
- 동일 clientMessageId 재전송: 메시지 1개만 생성.
- 수신자, 재로그인, 새로고침, WebSocket 수신에서 동일한 표현별 의미 표시.
- 타 사용자 분석 ID 재사용, 만료 분석, 변경된 원문: 거절.
- 원문 그대로 보내기: 의도 확인 배지 없음.
