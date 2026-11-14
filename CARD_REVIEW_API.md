> 업데이트 (2026-11-15): 최신 배포 Swagger에서 요청한 계약 반영을 확인했으며 프론트 연동도 적용했습니다. 아래의 미지원/임시 처리 설명은 요청 당시의 기록입니다. 현재 카드 이의제기와 즉시 확정 결산은 활성화되어 있고, 채팅은 원문을 유지한 채 analysisId·intentSelections·clientMessageId를 전송합니다. 실제 배포 검증 기준은 tests/openapi.json입니다.
# 카드 이의제기 · 즉시 확정 영수증 API 변경 요청

## 배포 상태
2026-11-15 Swagger 확인 기준 카드 상태는 PENDING / CONFIRMED만 지원하며, 카드 이의제기 API는 없습니다. 아래 내용은 **제안 계약**입니다. 프론트 UI와 호출 코드는 준비했지만 `js/config.js`의 `agreementReviewV2`는 false입니다. 아래 계약 배포 및 검증 후 true로 변경해야 실제 제출과 중간결산이 실행됩니다. 데모 저장이나 다른 사용자 명의 자동 확인은 하지 않습니다.

## 1. 카드 이의제기
`POST /api/cards/{cardId}/objections`

헤더: `X-User-Id`, `Content-Type: application/json`

```json
{ "comment": "금요일까지 하는 것으로 이해했습니다. 일정을 다시 정해 주세요." }
```

- 방의 현재 멤버만 요청 가능. 공백 제거 후 1~1000자 필수.
- PENDING 카드에만 허용. 이미 본인이 확인했더라도 전원 확인 전에는 이의제기 가능.
- 하나의 이의제기로 카드 전체를 REJECTED로 변경. REJECTED는 최종 상태이며 다시 확인하거나 복구할 수 없음. 새 카드 생성 필요.
- 확인과 이의제기는 동일 카드 단위 트랜잭션/잠금으로 처리. 마지막 확인과 경합 시 먼저 완료한 상태를 유지하고 나머지는 409 CARD_CLOSED 반환.
- 같은 요청 재시도는 중복 기록 없이 동일 결과 반환. 타 멤버는 403, 잘못된 내용은 400.

성공 응답은 공통 wrapper의 data에 카드 객체:
```json
{
  "success": true,
  "data": {
    "id": 12,
    "status": "REJECTED",
    "objection": {
      "userId": 5,
      "comment": "금요일까지 하는 것으로 이해했습니다. 일정을 다시 정해 주세요.",
      "createdAt": "2026-11-15T07:00:00+09:00"
    }
  },
  "error": null
}
```

방 카드 조회에도 REJECTED 카드와 objection을 반환하여 재로그인·다른 기기에서도 동일 표시. 기존 title/content/assignee/dueDate/confirmations 등 필드는 유지. 사유는 사용자 작성 콘텐츠이므로 lang에 따른 번역도 서버에서 담당. CARD_UPDATED 이벤트에 id/status/objection을 포함해 방 전체에 전송.

## 2. 중간결산 변경
기존 `POST /api/rooms/{roomId}/receipts` 유지. 요청 본문 없음.

- CONFIRMED이고 기존 확정 영수증에 포함되지 않은 카드만 서버가 선별.
- PENDING / REJECTED 카드 제외. 카드별 최신 버전도 서버에서 검증.
- 한 번의 결산에서 선정된 카드 전부를 하나의 영수증에 포함.
- 영수증과 모든 항목을 생성 즉시 CONFIRMED로 저장. 별도 사용자 응답은 받지 않음.
- 카드 확인 이력이 합의 근거. 사용자 명의 영수증 응답을 인위적으로 생성하지 않음.
- 트랜잭션과 카드별 영수증 연결 제약으로 중복 결산/동시 요청 방지. 기존 결과 재사용 또는 대상 없음 409 NO_ELIGIBLE_CARDS.
- 기존 응답 receiptId / roomId / created / sourceCardIds / status 유지. status는 CONFIRMED.
- 방 영수증 목록과 상세, 카드 receiptStatus도 즉시 확정 상태 반영. RECEIPT_CREATED 전송.

## 3. 영수증과 캘린더
프론트의 영수증 확인 및 이의제기 버튼과 /receipt-items/{id}/responses 호출은 제거했습니다.

`POST /api/rooms/{roomId}/calendar-events`의 `{ "sourceType": "RECEIPT_ITEM", "sourceId": 123 }` 유지. 방의 모든 현재 멤버가 등록 가능. 본인 담당 항목 여부로 제한하지 않음. 서버는 해당 방에 속한 확정 항목인지, 날짜가 있는지 검증. 동일 항목 중복 등록은 기존 결과 반환 또는 명확한 충돌 응답.

## 기존 데이터 마이그레이션
기존 PENDING / OBJECTED 영수증을 프론트가 확정으로 덮어쓰지 않습니다. 서버에서 처리 정책을 결정해야 합니다. 특히 기존 이의제기가 있던 영수증은 자동 승인하지 말고 별도 보존/관리자 처리 또는 새 카드 합의 절차로 이동해야 합니다. 이전 영수증의 미해결 이의제기가 있는 방은 현재 프론트의 결산 보호 로직이 유지됩니다.

## 검증 기준
- A의 이의제기 이후 B 화면 및 새로고침에 무산 상태·사유 반영.
- 이의제기 실패 시 입력 유지, 카드 상태 변경 없음.
- 무산 카드에 추가 확인 불가, 보드 및 결산 대상 제외.
- 전원 확인된 카드 여러 개가 즉시 확정 영수증 하나로 생성.
- 영수증 재확인 요청 0건. 모든 방 멤버의 캘린더 등록 허용.
- 재시도/동시 결산으로 중복 영수증·일정이 생성되지 않음.
