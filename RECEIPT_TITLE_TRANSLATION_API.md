# 제목 번역 회귀 분석 및 백엔드 수정 요청

> 2026-11-15 최신 배포 API를 직접 비교한 결과입니다. 이 문서는 이전의 ‘영수증 제목만 번역 누락’ 요청을 대체합니다. 현재는 검사한 카드·영수증·캘린더 응답 모두에서 제목이 요청 언어에 따라 바뀌지 않습니다.

## 1. 결론과 확인 범위

- 프론트 화면 표시 이전, **REST API 응답 자체의 title이 원문으로 유지**됩니다.
- 같은 사용자·같은 방·같은 리소스를 ko/en/vi/de로 조회해 비교했습니다.
- 본문은 일부 번역되므로 lang이 모든 경로에서 완전히 무시된다고 단정할 수는 없습니다. 제목과 본문 처리 경로를 나누어 점검해야 합니다.
- vi/de 요청에서도 영어 본문을 반환한 사례가 있어 제목 외에 언어별 캐시/번역 실패 처리도 확인이 필요합니다.
- 백엔드 소스·로그·DB에는 접근하지 않았습니다. 아래 원인 후보는 추정이며, 특정 코드나 캐시가 원인이라고 확정한 것은 아닙니다.
- 확인은 기존 데이터의 GET 조회로만 했습니다. 운영 데이터에 테스트 카드·영수증·일정을 생성하거나 수정하지 않았습니다.

Base URL: `https://backend-production-8acb6928.up.railway.app/api`
인증 헤더: `X-User-Id: 4`
확인 방: `roomId=85`
확인 영수증: `receiptId=47`

## 2. 실제 응답 비교

### A. 카드 목록

`GET /api/rooms/85/cards?lang={ko|en|vi|de}`

cardId=54, version=1:

| 요청 lang | title | content |
| --- | --- | --- |
| ko | title | 자세히요. |
| en | title | detail |
| vi | title | chi tiết |
| de | title | detail |

cardId=65, version=1:

| 요청 lang | title | content |
| --- | --- | --- |
| ko | this is title | this is.. detail |
| en | this is title | this is... detail |
| vi | this is title | this is.. detail |
| de | this is title | this is.. detail |

본문이 일부 변해도 제목은 동일합니다. `sampel1`, `weewf` 같은 임의 문자열도 확인했지만, 이런 문자열은 정상 번역에서도 그대로 남을 수 있으므로 판단 근거로 삼지 않았습니다.

### B. 영수증 상세

`GET /api/receipts/47?lang={ko|en|vi|de}`

itemId=60, sourceCardId=69:

| 요청 lang | items[].title | items[].what |
| --- | --- | --- |
| ko | research | OS 관련해서요 |
| en | research | about OS |
| vi | research | about OS |
| de | research | about OS |

제목은 전부 동일합니다. 베트남어·독일어 요청에도 영어 본문이 반환되는 이유도 확인해 주세요. 정상 번역인지, 원문/다른 언어 캐시로 대체된 것인지는 현재 응답만으로 확정할 수 없습니다.

### C. 캘린더 목록

`GET /api/rooms/85/calendar-events?lang={ko|en|vi|de}`

| eventId | sourceType | sourceId | ko/en/vi/de에서 반환된 title |
| --- | --- | --- | --- |
| 18 | RECEIPT_ITEM | 48 | 모두 title |
| 29 | RECEIPT_ITEM | 60 | 모두 research |

캘린더도 조회 응답부터 제목이 동일합니다. 프론트 호버만의 문제는 아닙니다.

## 3. 프론트 확인 결과

| 화면 | API / 사용 필드 |
| --- | --- |
| 채팅 합의 카드 | `/rooms/{id}/cards?lang=...`의 title/content |
| 합의 보드의 미결산 카드 | 같은 카드 응답의 title/content |
| 합의 영수증 | `/receipts/{id}?lang=...`의 items[].title/what |
| 캘린더 일정 | `/rooms/{id}/calendar-events?lang=...`의 title |
| 캘린더 호버 | 일정 title을 유지하고, 원본 카드 또는 영수증 항목에서 본문 조회 |

로컬 코드에서 확인한 요청 위치:
- `js/state.js`: 카드 목록 요청에 `I18n.language`를 lang으로 전달.
- `js/tools.js`: 영수증 상세와 캘린더 목록에 lang 전달.
- `js/calendar-preview.js`: 카드/영수증 상세 요청에 lang 전달.
- `js/user-api.js`의 ContentAPI.cardText: 받은 필드를 표시하며 자체 번역하지 않음.

현재 영수증 제목 보완 처리:
- 동일 sourceCardId와 sourceCardVersion의 카드 API 제목을 추가 조회해 표시합니다.
- 그러나 카드 API의 제목도 원문이면 이 보완 처리로 해결할 수 없습니다.
- 오래된 영수증을 최신 카드 제목으로 바꾸지 않도록 버전이 다른 경우에는 대체하지 않습니다.

## 4. 백엔드에서 우선 확인할 지점

아래는 실제 응답을 바탕으로 한 점검 후보입니다. 실제 클래스/메서드 이름은 저장소에 맞게 확인해 주세요.

### 4-1. 제목 번역 결과가 응답에 매핑되는지

각 CardResponse / ReceiptItemDto / CalendarEventResponse 생성 경로를 확인해 주세요.

흔한 누락 형태:

```text
content 또는 what = 번역 결과
 title = entity.title 또는 snapshot.title 그대로
```

확인 사항:
- 번역 서비스에 제목도 입력하는가?
- 번역 응답에서 title을 읽는가? 응답 필드 이름이 서로 다른가?
- 번역된 title을 DTO에 넣은 후 다른 매퍼가 원문으로 덮어쓰는가?
- 제목이 짧거나 영어이면 고유명사로 취급해 무조건 원문을 반환하는 조건이 있는가?
- title과 content를 한 문자열로 합친 뒤 다시 분리하는 과정에서 title이 누락되는가?

제목과 본문을 구조화된 필드로 번역하고 명시적으로 DTO에 매핑하는 방식이 좋습니다.

### 4-2. 언어별 번역 캐시

다음 정보가 캐시 키에 포함되는지 확인해 주세요.

- 리소스 종류: CARD / RECEIPT_ITEM / CALENDAR_EVENT 등
- 리소스 ID
- 원본 버전 또는 텍스트 해시
- **목표 언어(targetLanguage)**
- 필요 시 원본 언어 및 번역 스키마 버전
- 필드별 캐시를 쓴다면 title/content/what 구분

특히 확인할 사례:
- ko 응답을 en/vi/de 요청에 재사용하는가?
- 사용자 기본 언어를 사용하고 요청 lang을 무시하는가?
- 과거 본문만 저장된 캐시를 ‘전체 번역 완료’로 취급하는가?
- 번역 오류 시 원문으로 대체한 값을 성공 캐시에 영구 저장하는가?
- 원본이 바뀌었는데 과거 번역 캐시를 그대로 사용하는가?

수정 배포 시 관련 기존 캐시를 마이그레이션하거나 번역 스키마 버전을 올려 갱신해야 합니다. 신규 데이터에서만 동작하고 기존 영수증은 계속 잘못 보이는 상태를 피해야 합니다.

### 4-3. 원본 언어 결정 및 번역 실패

영문 제목과 한국어 본문처럼 한 카드에 혼합 언어가 있을 수 있습니다.

- 작성자의 기본 언어가 요청 언어와 같다는 이유만으로 모든 필드 번역을 생략하지 않는지 확인.
- 짧은 제목을 번역 모델이 그대로 유지하는 조건/프롬프트 확인.
- 외부 번역 호출 실패, 파싱 실패, 대상 언어 오류를 구분해 로그 기록.
- 정상 원문 유지와 번역 실패에 따른 원문 대체를 구분할 수 있도록 내부 상태를 보존.
- 실패 시 원문 데이터는 훼손하지 말고, 재조회 시 재시도 가능한 정책 적용.

### 4-4. 영수증 스냅샷과 캘린더 연결

- 영수증은 **생성 당시 저장된 제목·본문 스냅샷**을 번역해야 합니다.
- 현재 카드의 최신 제목을 읽어서 과거 영수증을 덮어쓰면 안 됩니다.
- RECEIPT_ITEM 기반 일정은 해당 영수증 항목의 제목을 번역해 사용해야 합니다. what을 제목 대신 사용하면 안 됩니다.
- CARD 기반 일정도 연결된 카드의 버전/스냅샷 정책을 일관되게 유지해 주세요.
- 일정 title을 생성 시 저장했더라도 조회 lang에 맞춘 표시용 번역을 제공해야 합니다.

## 5. 원하는 API 동작

기존 필드명과 공통 wrapper는 유지할 수 있습니다.

| API | lang에 맞게 반환해야 하는 필드 |
| --- | --- |
| GET /rooms/{roomId}/cards | title, content |
| GET /receipts/{receiptId} | items[].title, items[].what |
| GET /rooms/{roomId}/calendar-events | title |

예시 원문:
- 제목: `자료조사 초안 제출`
- 본문: `금요일까지 자료조사 초안을 공유해 주세요.`

영어 조회 예시:
- title: `Submit the research draft`
- content 또는 what: `Please share the research draft by Friday.`

번역 표현을 위 문구로 고정할 필요는 없습니다. 요청 언어와 의미가 올바른지가 기준입니다. 담당자 이름·ID·마감일·확인 상태·원본 스냅샷은 번역 과정에서 변경하지 않아야 합니다.

## 6. 재현 방법

서버가 실행 중인 환경에서 아래 PowerShell 명령으로 동일 리소스를 비교할 수 있습니다. 테스트 계정이 해당 방의 현재 멤버인지 먼저 확인해 주세요.

```powershell
$base = 'https://backend-production-8acb6928.up.railway.app/api'
$headers = @{ 'X-User-Id' = '4' }
foreach ($lang in @('ko', 'en', 'vi', 'de')) {
    $cards = Invoke-RestMethod "$base/rooms/85/cards?lang=$lang" -Headers $headers
    $receipt = Invoke-RestMethod "$base/receipts/47?lang=$lang" -Headers $headers
    $calendar = Invoke-RestMethod "$base/rooms/85/calendar-events?lang=$lang" -Headers $headers
    [pscustomobject]@{
        language = $lang
        cards = $cards.data | Where-Object { $_.id -in @(54, 65, 69) }
        receiptItems = $receipt.data.items
        calendarEvents = $calendar.data | Where-Object { $_.id -in @(18, 29) }
    } | ConvertTo-Json -Depth 12
}
```

## 7. 완료 기준

- [ ] 스테이징에서 명확한 자연어 제목/본문으로 카드 → 전원 확인 → 영수증 → 일정까지 생성해 검증.
- [ ] ko/en/vi/de 조회에서 제목과 본문이 각각 올바른 언어로 반환됨.
- [ ] 한 언어로 먼저 조회한 뒤 다른 언어로 바꿔도 캐시가 섞이지 않음.
- [ ] 캐시가 없는 첫 조회와 캐시 적중 조회 모두 정상.
- [ ] 기존 운영 카드·영수증·일정에도 수정 적용 확인.
- [ ] 동일 사용자로 lang만 변경하는 경우와 서로 다른 언어 계정으로 조회하는 경우 모두 확인.
- [ ] 제목과 본문 언어가 다른 혼합 언어 카드도 확인.
- [ ] 번역 서비스 오류 후 원문 대체가 성공 번역으로 고정되지 않음.
- [ ] 카드가 이후 수정돼도 기존 영수증의 생성 당시 내용·제목은 보존됨.
- [ ] 채팅 카드, 합의 보드, 영수증, 캘린더 및 호버에서 같은 버전의 제목 번역이 일관됨.

## 8. 수정 후 공유 요청

배포 버전/시각, 실제 수정 원인, 기존 번역 캐시 처리 여부, 위 API의 언어별 응답 예시를 공유해 주세요. 프론트는 영수증 제목이 자체적으로 정상 번역되는 것을 확인한 후 추가 카드 조회 fallback을 제거하겠습니다.
