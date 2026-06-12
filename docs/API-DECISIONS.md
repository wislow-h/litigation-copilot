# API 사용 결정 정리 — 단계별로 무엇을, 왜

> 두 파이프라인은 **동일한 프롬프트([lib/prompts.ts](../lib/prompts.ts))와 동일한 출력 스키마([lib/analysis-schema.ts](../lib/analysis-schema.ts))** 를 쓰도록 맞췄습니다. 그래야 "API/모델 자체의 차이"만 비교 화면에 드러나기 때문입니다.
>
> 구현 위치: Upstage = [lib/providers/upstage.ts](../lib/providers/upstage.ts), OpenAI = [lib/providers/openai.ts](../lib/providers/openai.ts)

---

## 한눈에 보기

| 단계 | Upstage | OpenAI | 공통 결정 |
|------|---------|--------|-----------|
| ① 문서 파싱·OCR | **Document Parse** (`/v1/document-digitization`) | (전용 API 없음) **Files API** + `pdf-lib` 분할 | — |
| ② 이벤트 추출 | **Solar Pro 3** (`solar-pro3`) + JSON Schema | **GPT-5.5** Responses API + Structured Outputs | 구조화 출력(JSON Schema) 강제 |
| ③ 타임라인·옵션 종합 | **Solar Pro 3** | **GPT-5.5** | 동일 프롬프트·스키마 |
| SDK | `openai` SDK (`base_url` 교체) | `openai` SDK | 단일 SDK로 양쪽 호출 |

---

## ① 문서 파싱 / OCR — "수백 페이지 스캔본을 텍스트로"

**Upstage → Document Parse API** (`POST /v1/document-digitization`, `model=document-parse`)
- **왜:** 소송기록은 대부분 **스캔본(이미지 PDF)·HWP**이고 표·머리말 등 레이아웃이 많습니다. Document Parse는 OCR(`ocr=auto`)과 레이아웃 인식을 함께 해서 **표·제목 구조가 살아있는 Markdown**을 돌려줍니다. HWP/HWPX를 지원하는 것도 한국 법률문서에서 결정적입니다.
- **왜 비동기(`/async`):** 동기 100페이지 vs 비동기 1,000페이지. 수백 페이지 기록을 가정하므로 PDF·문서류는 `/async`로 보내고 폴링합니다. (이미지 단건은 빠른 동기 엔드포인트 사용 — `IMAGE_EXTS` 분기)
- **출력:** `output_formats=["markdown"]` → 이후 LLM 단계가 먹기 좋은 형태.

**OpenAI → 전용 파싱 API 없음. Files API + 클라이언트 분할로 대체**
- **현실:** OpenAI에는 Document Parse에 대응하는 "레이아웃 보존 파싱/OCR 산출물" 제품이 **없습니다.** 대신 멀티모달 모델이 PDF를 직접 읽습니다(텍스트+페이지 이미지).
- **그래서 한 결정:**
  1. `pdf-lib`로 PDF를 **요청당 95페이지 이하로 분할** (Responses API의 PDF 입력 ~100페이지 제한 회피).
  2. 각 조각을 **Files API**(`POST /v1/files`, `purpose=user_data`)에 업로드해 `file_id` 확보.
  3. 파싱을 따로 하지 않고, **②번 추출 단계에서 모델이 원본 파일을 직접 판독**하게 함.
- **트레이드오프:** 파싱이 블랙박스라 중간 산출물(Markdown)이 없습니다. 대신 구성이 단순하고, 스캔 판독 품질이 모델에 통합됩니다. HWP·DOCX 등은 이 경로에서 미지원이라 업로드 시 제외하고 사용자에게 안내(`notes`)합니다 — **이 차이 자체가 비교 포인트**입니다.

> **핵심 비대칭:** Upstage는 "특화 파싱 API + LLM" 2단 구성, OpenAI는 "멀티모달 LLM 단일" 구성. 그래서 '같은 파이프라인'을 만들려면 OpenAI의 파싱 단계를 LLM-비전 판독으로 추상화해야 했습니다.

---

## ② 정보 추출 — "당사자·날짜·이벤트를 구조화 JSON으로"

**Upstage → Solar Pro 3** (`solar-pro3`, chat completions + `response_format` JSON Schema)
- **왜 IE 전용 API가 아니라 LLM인가:** Upstage엔 스키마 기반 **Universal Information Extraction API**도 있습니다. 하지만 우리가 필요한 건 단순 필드 추출을 넘어 "이벤트 유형 분류, 누락된 법정기한 계산, 일반인용 쉬운 설명"까지라서 **추론이 되는 LLM**이 적합했습니다. (IE API는 출처 bounding box·confidence를 주므로, **Phase 2에서 출처 하이라이트용으로 추가** 예정 — PRD Out of Scope 참고)
- **왜 한국어에 Solar:** Solar Pro 3는 한국어 성능이 헤드라인 강점이고, 비용도 저렴($0.15/$0.60 per 1M)이라 페이지가 많아도 부담이 적습니다.
- **청크 처리(map):** 컨텍스트 128K라 대형 기록은 파싱 Markdown을 ~60K자 단위로 잘라 청크별 추출 후 합칩니다(map-reduce의 map).

**OpenAI → GPT-5.5** (Responses API `/v1/responses`, `input_file` + Structured Outputs)
- **왜:** GPT-5.5는 추론 깊이가 강하고 컨텍스트가 1.05M이라 분할 압박이 적습니다. 파싱 산출물 없이 **업로드한 파일을 직접 보고** 이벤트를 뽑습니다(파싱+추출 통합).
- **구조화 출력:** `text.format: json_schema, strict:true`로 스키마를 강제 → 후처리 파싱 불필요.

**공통 결정 — 왜 JSON Schema(strict)를 양쪽 다 강제했나:** 결과를 같은 타입(`CaseAnalysis`)으로 받아야 동일 UI에 렌더하고 공정 비교가 됩니다. strict 모드 제약(모든 필드 required + `additionalProperties:false`)에 맞춰 스키마를 작성했고, 혹시 한쪽이 거부하면 "JSON만 출력" 프롬프트로 폴백합니다([lib/providers/llm.ts](../lib/providers/llm.ts)).

---

## ③ 타임라인·옵션 종합 — "쉬운 말 요약 + 행동 가이드"

- **Upstage:** Solar Pro 3 (reduce 단계) / **OpenAI:** GPT-5.5
- **왜 같은 모델을 한 번 더:** 청크별로 흩어진 이벤트를 **중복 병합·정렬하고, 현재 단계를 판단해 옵션을 생성**하는 추론 작업이라 별도 단계로 분리했습니다.
- **동일 프롬프트(`ANALYZE_SYSTEM`):** 항소기한 등 법정기간 계산, 옵션의 장단점·필요증거·긴급도 구성을 양쪽에 똑같이 지시 → 결과 차이는 순수 모델 품질 차이.

---

## 전체를 관통한 설계 결정

1. **`openai` SDK 하나로 양쪽 호출.** Upstage가 OpenAI 호환(`base_url=https://api.upstage.ai/v1`)이라 가능. 코드 중복 최소화.
2. **프롬프트·스키마 공유, 어댑터만 분리.** "API/모델 차이"만 변수로 남기기 위함.
3. **결과를 공통 `CaseAnalysis` 스키마로 수렴.** 한 컴포넌트로 좌우 비교 렌더.
4. **단계별 메트릭 수집**(파싱/분석/총 시간, 이벤트·옵션 수) → 비교 화면에 노출.

## 실측에서 드러난 차이 (3페이지 대여금 샘플, 2026-06-12)

| | 파싱 | 추출+분석 | 타임라인 | 항소기한 | 메모 |
|---|---|---|---|---|---|
| Upstage | 4.3s | 39.7s | 14개 | 2025-03-18 ✅ | 증거 제출까지 세분화 |
| OpenAI | 0.6s | 93s | 11개 | 2025-03-18 ✅ | 기한 도과 여부 추론 정확 |

- Solar Pro 3는 초기에 실행 간 편차로 판결문을 누락 → `temperature:0`으로 안정화.
- 항소기한 연도 오계산은 프롬프트에 "송달일 연도 기준" 명시로 교정.
- 자세한 모델 ID·엔드포인트·한도는 [PRD.md](../PRD.md) §4 참고.
