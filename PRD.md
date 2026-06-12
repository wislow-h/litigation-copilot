# PRD — Litigation Copilot

> 법률 지식이 없는 일반인을 위한 소송기록 분석·가이드 서비스 (Upstage vs OpenAI 파이프라인 비교)

- 작성일: 2026-06-10
- 상태: MVP 개발 착수
- 작성: Jean + Claude

---

## 1. 배경 및 문제 정의

소송 당사자가 된 일반인은 다음과 같은 어려움을 겪는다.

1. **자료의 방대함**: 소장, 답변서, 준비서면, 증거목록, 판결문 등 소송기록이 수백 페이지에 달하며, 스캔본(이미지 PDF)이나 HWP 등 다양한 포맷으로 존재한다.
2. **용어의 난해함**: "변론기일", "석명준비명령", "항소이유서" 등 법률 용어를 이해하지 못해 현재 상황 파악 자체가 불가능하다.
3. **시간 압박**: 항소기간(판결 송달 후 2주), 답변서 제출기한 등 **놓치면 회복 불가능한 기한**이 존재하지만 일반인은 이를 인지하기 어렵다.
4. **의사결정의 막막함**: "지금 내가 뭘 해야 하지?"에 대한 답을 변호사 상담 없이는 얻을 수 없다.

## 2. 제품 목표

| # | 목표 | 설명 |
|---|------|------|
| G1 | **상황의 시각화** | 소송기록을 업로드하면 사건의 과거~현재 흐름을 타임라인으로 확정적으로 보여준다 |
| G2 | **행동 가이드** | 현 시점에서 선택 가능한 옵션(변론 방향, 필요 증거, 항소 전략 등)을 장단점과 함께 제시한다 |
| G3 | **API 비교 실험** | 동일한 입력에 대해 **Upstage 파이프라인**과 **OpenAI 파이프라인**의 결과를 나란히 비교할 수 있게 한다 |

### 타깃 사용자

- **주 사용자**: 법률 지식이 없는 소송 당사자(원고/피고/피항소인 등) 또는 그 가족
- **부 사용자(내부)**: 두 AI 제공사의 품질/비용/속도를 평가하려는 개발자·기획자

### 핵심 사용자 시나리오

> 김철수(45세, 자영업)는 대여금 반환 소송의 피고다. 법원에서 받은 소장·변론기일통지서·준비서면 스캔본 PDF 300페이지를 업로드한다. 5분 뒤, 사건이 "소 제기 → 답변서 제출 → 1차 변론기일 완료" 단계까지 진행됐다는 타임라인과, "다음 변론기일(2026-07-02)까지 ① 변제 사실 입증(이체내역 증거 제출) ② 소멸시효 항변 ③ 조정 신청" 3가지 옵션을 장단점과 함께 확인한다.

## 3. MVP 기능 요구사항

### F1. 파일 업로드 (대용량)

| 항목 | 요구사항 |
|------|----------|
| 포맷 | PDF(스캔본 포함), 이미지(JPG/PNG/TIFF), DOCX, HWP/HWPX¹ |
| 크기 | 파일당 최대 200MB, 사건당 다중 파일 업로드 |
| 방식 | 스트리밍 업로드(메모리에 전체 적재 금지), 드래그&드롭 UI |
| 처리 | 업로드 즉시 사건(Case) 생성 → 비동기 분석 시작 → 진행상태 폴링 표시 |

¹ HWP/HWPX는 Upstage Document Parse만 지원. OpenAI 파이프라인에서는 미지원 안내 (비교 포인트).

### F2. 사건 타임라인 시각화

- 소송기록에서 **날짜가 특정된 사건(이벤트)** 을 추출하여 시간순 수직 타임라인으로 표시
- 이벤트 유형 구분: `소제기` `서면제출` `변론기일` `증거제출` `판결/결정` `송달` `기한(예정)` 등 — 유형별 색상/아이콘
- 각 이벤트에 출처(어느 문서에서 추출했는지) 표기 → 신뢰성 확보
- **현재 시점 마커**와 함께, 임박한 기한(예: 항소기한)은 강조 표시
- 사건 개요 카드: 사건번호, 법원, 당사자(원고/피고), 사건 유형, 현재 단계, 쉬운 말 요약

### F3. 행동 옵션 제시

- 현 단계 기준으로 선택 가능한 옵션을 **2~5개 카드**로 제시
- 각 옵션 카드 구성:
  - 제목 + 쉬운 말 설명 (중학생도 이해 가능한 수준)
  - 장점 / 단점 / 위험요소
  - 필요한 증거·서류 목록
  - 관련 기한 (있는 경우)
  - 긴급도 (높음/중간/낮음)
- 예시: 소송 진행 중 → 변론 전략·증거 수집 옵션 / 패소 직후 → 항소(사실오인·법리오해 주장 vs 양형부당 주장) vs 항소 포기 옵션
- **면책 고지 필수**: "본 서비스는 법률 자문이 아니며, 중요한 결정 전 반드시 변호사와 상담하세요"를 모든 결과 화면에 고정 노출

### F4. Upstage vs OpenAI 비교 뷰

- 하나의 사건에 대해 두 파이프라인을 **병렬 실행**, 결과를 좌우 2단으로 나란히 표시
- 비교 메트릭 표시: 처리 시간(단계별), 추출 이벤트 수, 옵션 수
- 각 파이프라인의 단계별 진행상태(파싱 → 추출 → 분석) 실시간 표시
- 단일 파이프라인만 실행하는 모드도 지원 (API 키가 하나만 있는 경우)

## 4. API 매핑 (조사 결과, 2026-06 기준)

### 파이프라인 단계별 매핑

| 단계 | Upstage | OpenAI |
|------|---------|--------|
| **① 문서 파싱/OCR** | `POST /v1/document-digitization` (model=`document-parse`, ocr=auto) — 동기 100p / 비동기 1,000p, HTML·Markdown 출력, HWP 지원 | 전용 파싱 API 없음 → `POST /v1/files` + Responses API `input_file` (요청당 ~100p/50MB, 초과 시 pdf-lib로 클라이언트 분할) |
| **② 정보 추출** (당사자·날짜·이벤트) | Solar Pro 3 + `response_format`(JSON Schema) — 파싱된 Markdown 기반. (Phase 2: 전용 `POST /v1/information-extraction` — bounding box·confidence 제공) | `gpt-5.5` + Structured Outputs (`json_schema`, strict) |
| **③ 타임라인 생성** | `POST /v1/chat/completions`, model=`solar-pro3` (128K ctx → 대용량은 청크 map-reduce) | `POST /v1/responses`, model=`gpt-5.5` (1.05M ctx → 통째 처리 가능) |
| **④ 상황분석·옵션 생성** | `solar-pro3` (reasoning, 한국어 강점) | `gpt-5.5` (`reasoning_effort: high`) |

- Upstage는 OpenAI SDK 호환 (`base_url=https://api.upstage.ai/v1`) → 단일 SDK로 양쪽 구현

### 구조적 비대칭 (= 비교 실험의 관전 포인트)

1. **특화 API 조합(Upstage) vs 단일 멀티모달 LLM(OpenAI)**: Upstage는 파싱 결과가 명시적 산출물(Markdown)로 남아 디버깅·감사 가능. OpenAI는 블랙박스지만 구성이 단순
2. **컨텍스트**: Solar Pro 3 128K vs GPT-5.5 1.05M → Upstage 경로는 대형 기록에서 청크 분할·병합 필요
3. **한국어/한국 문서**: HWP 지원, 한국어 성능은 Upstage 강점. 추론 깊이는 GPT-5.5 강점
4. **비용 구조**: Upstage = 페이지당 과금($0.01~0.03/p) + 저렴한 LLM($0.15/$0.60 per 1M) vs OpenAI = 순수 토큰 과금($5/$30 per 1M, 스캔 이미지가 입력 토큰 증폭)

## 5. 시스템 설계

### 기술 스택

- **Next.js 15 (App Router) + TypeScript + Tailwind CSS** — 풀스택 단일 앱
- 저장소: MVP는 로컬 파일시스템 (`data/cases/{id}/` — 원본 파일 + JSON 메타/결과). DB 없음
- LLM 호출: `openai` SDK 하나로 양사 모두 호출 (Upstage는 base_url 변경)
- PDF 분할: `pdf-lib`

### 아키텍처 흐름

```
[브라우저]
  └─ 업로드(스트리밍) ──▶ POST /api/cases  ──▶ data/cases/{id}/files/
                              │
                              ├─ (백그라운드) UpstagePipeline.run()
                              │     parse(document-digitization, async)
                              │     → extract+analyze(solar-pro3, 청크 map-reduce)
                              │
                              └─ (백그라운드) OpenAIPipeline.run()
                                    upload(files) → analyze(responses, gpt-5.5,
                                    input_file + json_schema, >100p면 분할)
  └─ 폴링 GET /api/cases/{id} ──▶ 단계별 status + 결과 JSON
  └─ 결과 화면: 타임라인 / 옵션 카드 / 비교 메트릭 (좌우 2단)
```

### 공통 결과 스키마 (두 파이프라인이 동일 스키마 출력 → 공정 비교)

```ts
interface CaseAnalysis {
  caseInfo: { caseNumber?, court?, caseType, parties: {role, name}[], currentStage, plainSummary }
  timeline: { date, title, description, type, sourceDoc?, isDeadline, isPast }[]
  options:  { title, description, pros[], cons[], requiredEvidence[], deadline?, urgency }[]
  metrics:  { parseMs, analyzeMs, totalMs, eventCount, optionCount }
}
```

## 6. 비기능 요구사항

| 항목 | 요구사항 |
|------|----------|
| 대용량 | 200MB 파일 스트리밍 업로드, 분석은 비동기(폴링) — 업로드 응답 3초 내 |
| 개인정보 | 소송기록은 민감정보. MVP는 로컬 저장만, 외부 전송은 분석용 API 호출에 한정. 사건 삭제 기능 제공 |
| 면책 | 모든 결과 화면에 "법률 자문 아님" 고지 고정 |
| 장애 | 한쪽 파이프라인 실패 시 다른 쪽 결과는 정상 표시. 단계별 에러 메시지 노출 |
| 설정 | API 키·모델 ID는 `.env` 로 주입 (`UPSTAGE_API_KEY`, `OPENAI_API_KEY`, 모델 오버라이드 가능) |

## 7. 성공 지표 (MVP)

- 300페이지 스캔 PDF 기준 업로드→결과까지 **10분 이내**
- 타임라인 이벤트 날짜 정확도(샘플 수기 검증) **90% 이상**
- 두 파이프라인 결과가 동일 스키마로 비교 화면에 정상 렌더링
- 비전문가 테스터가 "내 상황이 이해된다"고 답하는 비율 80% 이상 (5인 테스트)

## 8. Out of Scope (MVP 제외)

- 회원가입/인증, 멀티테넌시, DB
- 서면(답변서 등) 자동 작성
- 판례 검색·인용 (Phase 2)
- Upstage Information Extraction 전용 API 연동 — bounding box 기반 출처 하이라이트 (Phase 2)
- 모바일 최적화

## 9. 마일스톤

| 단계 | 내용 |
|------|------|
| M1 | 프로젝트 스캐폴드 + 스트리밍 업로드 + 사건 저장소 |
| M2 | Upstage 파이프라인 (parse → 청크 추출 → 분석) |
| M3 | OpenAI 파이프라인 (files → responses, PDF 분할) |
| M4 | 타임라인·옵션 UI + 비교 뷰 + 메트릭 |
| M5 | 에러 처리·면책 고지·삭제 기능, E2E 점검 |
