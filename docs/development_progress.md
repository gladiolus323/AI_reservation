# AI 검사 예약 추천 시스템 - 개발 진행 현황

**최종 업데이트**: 2025-12-02

---

## 프로젝트 개요

병원 검사 예약 시 AI가 자동으로 최적의 시간대를 추천하는 시스템

### 시스템 구성
```
[환자] → [웹 채팅 UI] → [Express 백엔드 + Claude API] → [MCP 도구] → [CSV 데이터]
```

---

## 완료된 작업

### 1. MCP 서버 구축 ✅

**위치**: `mcp-server/`

#### 파일 구조
```
mcp-server/
├── package.json              # 프로젝트 설정
├── src/
│   ├── index.js              # MCP 서버 메인
│   ├── data-loader.js        # CSV 데이터 로더
│   └── tools/
│       ├── get-patient-info.js       # 환자 정보 조회
│       ├── get-exam-by-code.js       # 처방코드로 검사 조회
│       ├── get-exam-constraints.js   # 검사 제약조건 조회
│       └── get-unavailable-slots.js  # 예약 불가능 시간 조회
├── quick-test.js             # 빠른 테스트 도구
├── integration-test.js       # 통합 테스트 (10개 시나리오)
├── test-client.js            # MCP 프로토콜 테스트 클라이언트
└── test-results.json         # 테스트 결과
```

#### MCP 도구 (4개)

| 도구명 | 설명 | 상태 |
|--------|------|------|
| `get_patient_info` | 환자번호로 기존 예약, 외래 예약일 조회 | ✅ 완료 |
| `get_exam_by_code` | 처방코드로 검사명, 장비유형 조회 | ✅ 완료 |
| `get_exam_constraints` | 처방코드로 장비유형, 소요시간, 규칙 조회 | ✅ 완료 |
| `get_unavailable_slots` | 예약 불가능 시간 조회 (장비 예약 + 환자 충돌 + 간격 규칙) | ✅ 완료 |

> **변경사항 (2025-12-02)**: 처방코드 입력 방식으로 변경. `search_exam_name` 삭제, `get_exam_by_code` 추가. 모든 도구에서 `exam_name` → `exam_code`로 파라미터 변경.

### 2. 데이터 파일 ✅

**위치**: `data/`

| 파일 | 내용 | 건수 |
|------|------|------|
| `patient_schedule.csv` | 환자별 검사 예약 현황 | 7,927건 |
| `resource_schedule.csv` | 장비별 예약 현황 | 7,927건 |
| `constraints.csv` | 검사별 제약조건 (장비유형, 소요시간, 태그, 규칙) | 250건 |

### 3. 병원 규칙 설정 ✅

**위치**: `data/hospital_rules.txt`

```
[병원 설정]
추천 기간: 30일 이내

[추천 규칙]
검사는 외래 진료일 이전에 완료될 수 있도록 추천해주세요
금식이 필요한 검사는 오전 10시 이전으로 추천해주세요
같은 날 검사는 최대 2개까지만 추천해주세요

[우선순위]
1. 검사 간 의료적 간격 규칙 준수가 가장 중요합니다
```

### 4. Express 백엔드 서버 ✅

**위치**: `backend/`

#### 파일 구조
```
backend/
├── package.json
├── src/
│   ├── index.js              # Express 서버 메인
│   ├── routes/
│   │   └── chat.js           # 채팅 API 엔드포인트
│   ├── services/
│   │   ├── claude.js         # Claude API 연동
│   │   └── mcp-tools.js      # MCP 도구 호출
│   └── prompts/
│       └── system-prompt.js  # AI 시스템 프롬프트
```

#### API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/chat` | 채팅 메시지 전송 |
| DELETE | `/api/chat/:sessionId` | 세션 초기화 |
| GET | `/api/health` | 헬스 체크 |

### 5. 웹 채팅 UI ✅

**위치**: `web/`

| 파일 | 설명 |
|------|------|
| `index.html` | AI 채팅 인터페이스 |
| `schedule.html` | 검사실 예약 시간표 시각화 |

#### 기능
- 실시간 채팅 인터페이스
- 빠른 입력 버튼 (환자번호 예시, 처방코드 예시)
- 처방명 확인 버튼 ("네, 맞습니다" / "아니요, 다시 입력할게요")
- 마크다운 렌더링 지원
- 세션 관리 (새 대화 시작)

### 6. 통합 테스트 ✅

#### MCP 도구 테스트 (10개 시나리오)

| # | 시나리오 | 결과 |
|---|----------|------|
| 1 | 기본 MRI 검사 예약 플로우 | ✅ 성공 |
| 2 | 내시경 검사 예약 (장비유형 연결) | ✅ 성공 |
| 3 | 시간 충돌 감지 | ✅ 성공 |
| 4 | 핵의학 검사 간격 규칙 | ✅ 성공 |
| 5 | 존재하지 않는 환자 처리 | ✅ 성공 |
| 6 | 존재하지 않는 검사명 처리 | ✅ 성공 |
| 7 | CT 다중 리소스 조회 | ✅ 성공 |
| 8 | 외래 예약일 이전 검사 완료 | ✅ 성공 |
| 9 | 금식 검사 오전 예약 | ✅ 성공 |
| 10 | 바륨 검사 간격 규칙 | ✅ 성공 |

#### 전체 시스템 통합 테스트

```
테스트 1: 환자번호 입력 → 환자 정보 및 기존 예약 조회 ✅
테스트 2: MRI 검사 요청 → 검사 종류 안내 ✅
테스트 3: 뇌 MRI 선택 → 3개 추천 시간대 제시 ✅
```

---

## 예약 추천 플로우

```
1. 환자번호 입력
   → get_patient_info(환자번호)
   → 기존 예약 목록, 외래 예약일 확인
   → "처방코드를 입력해주세요" 안내

2. 처방코드 입력
   → get_exam_by_code(처방코드)
   → "OOO 검사가 맞으신가요?" 확인

3. 검사 확정
   → get_exam_constraints(처방코드)
   → 장비유형, 소요시간, 태그, 규칙 확인
   → AI가 "선호하시는 날짜나 시간대가 있으신가요?" 질문

4. 선호 일정 확인 후 불가능 시간 조회
   → get_unavailable_slots(장비유형, 시작일, 종료일, 환자번호, 처방코드)
   → 반환값:
     - resourceBookings: 이미 예약된 시간
     - patientTimeConflicts: 환자의 기존 예약과 충돌
     - gapViolations: 검사 간격 규칙 위반 (해당 날짜 전체 불가)
     - isWeekend: 주말 휴무

5. 최종 추천 (3개)
   → 운영시간(09:00~17:00)에서 불가능 시간 제외
   → AI가 hospital_rules.txt 기반으로 최적 시간 추천
```

---

## 주요 검사 간격 규칙

| 태그 조합 | 간격 | 사유 |
|-----------|------|------|
| #Nuclear ↔ #Nuclear | 2일 이상 | 방사성 동위원소 간섭 방지 |
| #Barium → #Abdomen | 4일 이상 | 바륨 잔류로 영상 품질 저하 |
| #Sedation → #Treadmill | 2일 이상 | 진정 후 협조 곤란 |

---

## 환경 설정

### API 키
- **위치**: `.env`
- **내용**: `ANTHROPIC_API_KEY=sk-ant-...`

### 실행 방법

```bash
# 백엔드 서버 시작 (포트 3000)
cd backend
npm install
npm start

# 웹 UI 접속
http://localhost:3000

# MCP 도구 개별 테스트
cd mcp-server
node quick-test.js patient 00003795
node integration-test.js
```

---

## 관련 문서

| 문서 | 설명 |
|------|------|
| [ai_reservation_agent.md](ai_reservation_agent.md) | AI 에이전트 설계 문서 |
| [mcp_server_test_report.md](mcp_server_test_report.md) | MCP 서버 테스트 결과 상세 |

---

## 프로젝트 완료 상태

| 항목 | 상태 |
|------|------|
| MCP 서버 구축 | ✅ 완료 |
| 데이터 파일 구성 | ✅ 완료 |
| 병원 규칙 설정 | ✅ 완료 |
| Express 백엔드 서버 | ✅ 완료 |
| Claude API 연동 | ✅ 완료 |
| 웹 채팅 UI | ✅ 완료 |
| 통합 테스트 | ✅ 완료 |

**전체 시스템 구현 완료!** 🎉

---

## 변경 이력

### 2025-12-02

#### 도구 리팩토링: 5개 → 4개

| 변경 전 | 변경 후 | 설명 |
|---------|---------|------|
| `get_available_slots` | 삭제 | `get_unavailable_slots`로 대체 |
| `check_conflicts` | 삭제 | `get_unavailable_slots`로 통합 |
| (신규) | `get_unavailable_slots` | 예약 불가능 시간 조회 |

#### `get_unavailable_slots` 반환값

```javascript
{
  equipmentType: "MRI",
  resources: ["MRI_1", "MRI_2", ...],
  operatingHours: { start: "09:00", end: "17:00" },
  unavailableSlots: [
    {
      date: "2025-10-29",
      dayOfWeek: "수",
      isWeekend: false,
      resourceBookings: {
        "MRI_1": [
          { start: "09:30", end: "10:00", reason: "예약됨" },
          { start: "14:00", end: "14:30", reason: "예약됨" }
        ]
      },
      patientTimeConflicts: [
        { start: "10:30", end: "11:00", exam: "CT", reason: "환자 기존 예약" }
      ],
      gapViolations: [
        { allDay: true, reason: "Kidney Scan과 2일 간격 필요" }
      ]
    }
  ]
}
```

#### 변경 이유

1. **데이터 효율성**: 가능한 모든 슬롯 대신 불가능한 시간만 반환
2. **중복 제거**: `check_conflicts`와 기능 중복 해소
3. **AI 유연성**: 운영시간에서 불가능 시간을 제외하여 자유롭게 추천

#### 대화 흐름 개선

- 검사 확정 후 "선호하시는 날짜나 시간대가 있으신가요?" 질문 추가
- 환자의 선호를 반영한 기간으로 슬롯 조회

#### 처방코드 입력 방식 변경

| 변경 전 | 변경 후 | 설명 |
|---------|---------|------|
| `search_exam_name` | 삭제 | 검사명 키워드 검색 제거 |
| (신규) | `get_exam_by_code` | 처방코드로 검사 정보 조회 |
| `get_exam_constraints(exam_name)` | `get_exam_constraints(exam_code)` | 파라미터 변경 |
| `get_unavailable_slots(..., exam_name)` | `get_unavailable_slots(..., exam_code)` | 파라미터 변경 |

#### 새로운 대화 플로우

```
1. 환자번호 입력 → 환자 정보 확인 → "처방코드를 입력해주세요"
2. 처방코드 입력 → "OOO 검사가 맞으신가요?"
3. 확인 → "선호하시는 날짜나 시간대가 있으신가요?"
4. 선호 확인 → 시간 추천 3개
```

#### 변경 이유

1. **정확성**: 처방코드는 유일하므로 검색 모호성 제거
2. **효율성**: 의사가 처방코드로 오더하므로 환자도 코드를 보고 옴
3. **단순화**: 검색 → 선택 단계 제거로 대화 단축

#### 웹 UI 개선

| 항목 | 변경 전 | 변경 후 |
|------|---------|---------|
| 헤더 설명 | "환자번호와 검사명을 알려주시면..." | "환자번호와 처방코드를 알려주시면..." |
| 퀵 버튼 | MRI 예약, 내시경 예약, 시간 문의 | 처방코드 예시 (CT), 처방코드 예시 (MRI), 오전 선호 |
| 확인 버튼 | (없음) | 처방명 확인 시 "네, 맞습니다" / "아니요, 다시 입력할게요" 버튼 표시 |

#### 처방명 확인 버튼 기능

AI가 "OOO 검사가 맞으신가요?" 질문 시 자동으로 확인 버튼이 표시됨:

```
┌─────────────────────────────────────────┐
│ AI: Thyroid uptake scan 99mTc 검사가    │
│     맞으신가요?                          │
│                                         │
│  [✓ 네, 맞습니다]  [✗ 아니요, 다시 입력할게요] │
└─────────────────────────────────────────┘
```

- **네, 맞습니다** 클릭 → "네, 맞습니다" 메시지 전송 → 선호 일정 질문으로 진행
- **아니요** 클릭 → "아니요, 처방코드를 다시 입력할게요" 메시지 전송 → 처방코드 재입력 안내

#### 삭제된 파일

| 파일 | 사유 |
|------|------|
| `mcp-server/src/tools/search-exam-name.js` | 처방코드 방식으로 변경 |
| `mcp-server/src/tools/get-available-slots.js` | `get_unavailable_slots`로 대체 |
| `mcp-server/src/tools/check-conflicts.js` | `get_unavailable_slots`로 통합 |
