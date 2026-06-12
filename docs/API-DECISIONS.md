# API 사용 결정 정리 — 단계별로 무엇을, 왜

> 두 파이프라인은 **동일한 프롬프트([lib/prompts.ts](../lib/prompts.ts))와 동일한 출력 스키마([lib/analysis-schema.ts](../lib/analysis-schema.ts))** 를 쓰도록 맞췄습니다. 그래야 "API/모델 자체의 차이"만 비교 화면에 드러나기 때문입니다.
>
> 구현 위치: Upstage = [lib/providers/upstage.ts](../lib/providers/upstage.ts), OpenAI = [lib/providers/openai.ts](../lib/providers/openai.ts)
>
> 🧪 **직접 체험:** 홈 화면의 **"샘플로 바로 체험"** 또는 **[샘플 소송기록 PDF 다운로드](../public/sample/sample_litigation.pdf)** (대여금 1심 패소 시나리오, 3페이지). 생성 스크립트: [scripts/make_sample_pdf.py](../scripts/make_sample_pdf.py)

---

## 사용한 API 공식 문서 (클릭 시 이동)

**Upstage**
- 📄 [Document Parse](https://console.upstage.ai/docs/capabilities/document-parse) — 문서 파싱·OCR (`/v1/document-digitization`)
- 🧩 [Universal Information Extraction](https://console.upstage.ai/docs/capabilities/information-extraction/universal-information-extraction) — 스키마 기반 정보 추출 (Phase 2 예정)
- 💬 [Chat (Solar LLM)](https://console.upstage.ai/docs/capabilities/chat) — `/v1/chat/completions`, OpenAI 호환
- 🌟 [Solar Pro 3 소개](https://www.upstage.ai/blog/en/solar-pro-3-0323) — 모델 스펙·한국어 성능
- 🔑 [API 콘솔·키 발급](https://console.upstage.ai) · [요금](https://www.upstage.ai/pricing/api)

**OpenAI**
- 📥 [File inputs (PDF)](https://platform.openai.com/docs/guides/pdf-files) — Responses API에 파일 직접 입력
- 🗂️ [Files API](https://platform.openai.com/docs/api-reference/files) — `/v1/files` 업로드
- 🧱 [Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs) — `json_schema` strict
- 🧠 [Responses API](https://platform.openai.com/docs/api-reference/responses) · [Models (GPT-5.5)](https://platform.openai.com/docs/models)
- 🔑 [API 키 발급](https://platform.openai.com/api-keys)

---

## 한눈에 보기

| 단계 | Upstage | OpenAI | 공통 결정 |
|------|---------|--------|-----------|
| ① 문서 파싱·OCR | **[Document Parse](https://console.upstage.ai/docs/capabilities/document-parse)** (`/v1/document-digitization`) | (전용 API 없음) **[Files API](https://platform.openai.com/docs/api-reference/files)** + `pdf-lib` 분할 | — |
| ② 이벤트 추출 | **[Solar Pro 3](https://console.upstage.ai/docs/capabilities/chat)** (`solar-pro3`) + JSON Schema | **[GPT-5.5](https://platform.openai.com/docs/guides/pdf-files)** Responses API + [Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs) | 구조화 출력(JSON Schema) 강제 |
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

## 각 단계에서 사용된 프롬프트 (실제 전문)

> 원본: [lib/prompts.ts](../lib/prompts.ts). `${today}` 는 호출 시점의 오늘 날짜(YYYY-MM-DD)로 치환됩니다. **두 제공사가 같은 프롬프트를 공유**합니다.

### ① 파싱 (Upstage 전용 — 프롬프트 없음)
Document Parse는 LLM 프롬프트가 아니라 파라미터로 제어합니다: `model=document-parse`, `ocr=auto`, `output_formats=["markdown"]`. OpenAI 경로는 별도 파싱 없이 ②에서 파일을 직접 판독합니다.

### ② 이벤트 추출 — System 프롬프트 (`EXTRACT_SYSTEM`)
```text
당신은 한국 소송기록 분석 전문가입니다. 주어진 소송기록(일부)에서 날짜가 특정되거나 추정 가능한 모든 사건(이벤트)을 빠짐없이 추출합니다.

규칙:
- 소 제기, 서면 제출, 송달, 변론기일, 증거 제출, 판결/결정, 각종 기한(항소기한 등)을 모두 포함합니다.
- 항소기한처럼 문서에 명시되지 않았지만 법정기간으로 계산 가능한 기한은 직접 계산해 deadline 이벤트로 추가합니다. 항소기간은 판결정본 송달일 다음 날부터 2주(14일)입니다. 계산 시 반드시 송달일과 같은 연도를 기준으로 일수를 더하세요(예: 2025-03-04 송달 → 2025-03-18). 오늘 날짜를 기준으로 삼지 마십시오.
- 날짜가 불명확하면 가장 합리적인 추정 날짜를 쓰고 description에 "추정"임을 밝힙니다.
- description은 법률 지식이 없는 일반인이 이해할 수 있는 쉬운 한국어로 작성합니다.
- caseInfoNotes에는 이 부분에서 확인된 사건번호, 법원, 당사자, 사건 유형, 진행 단계 단서를 메모합니다.
- 오늘 날짜: ${today}
```

**② 추출 — User 프롬프트**
- Upstage (`extractUserPrompt`): 파싱된 Markdown 청크를 넣음
  ```text
  다음은 소송기록의 일부입니다 (출처: {문서명}). 이벤트를 추출하세요.

  ---
  {파싱된 Markdown}
  ```
- OpenAI (`EXTRACT_FROM_FILE_PROMPT`): 업로드한 원본 파일과 함께 전달
  ```text
  첨부된 소송기록 문서를 읽고 이벤트를 추출하세요. 문서가 스캔본이면 내용을 정확히 판독하여 추출합니다.
  (출처 문서명: {문서명})
  ```

### ③ 타임라인·옵션 종합 — System 프롬프트 (`ANALYZE_SYSTEM`)
```text
당신은 법률 지식이 없는 일반인을 돕는 한국 소송 안내 도우미입니다. 추출된 사건 정보를 종합하여 (1) 사건 개요, (2) 확정적 타임라인, (3) 지금 선택 가능한 행동 옵션을 제시합니다.

규칙:
- 모든 설명은 중학생도 이해할 수 있는 쉬운 한국어로 씁니다. 법률 용어를 쓸 때는 괄호로 풀어 설명합니다.
- timeline: 중복 이벤트는 병합하고, 날짜순으로 정렬하며, 오늘(${today}) 이후의 기한은 isDeadline=true로 표시합니다.
- options: 현재 진행 단계에 맞는 현실적인 선택지를 2~5개 제시합니다.
  - 예: 소송 진행 중이면 → 변론 방향(부인/항변), 필요한 증거 수집, 조정·화해 시도
  - 예: 1심 패소 직후면 → 항소(사실오인·법리오해 다투기 vs 양형부당 주장), 항소 포기와 그 결과
  - 각 옵션마다 장점, 단점, 필요한 증거/서류, 관련 기한, 긴급도를 반드시 채웁니다.
- 놓치면 회복 불가능한 기한(항소기한, 답변서 제출기한 등)이 있으면 urgency=high 옵션과 deadline 이벤트로 반드시 드러냅니다.
- 단정적인 승소/패소 예측은 하지 않습니다. 사실관계가 불명확하면 그렇다고 밝힙니다.
- 오늘 날짜: ${today}
```

**③ 종합 — User 프롬프트 (`analyzeUserPrompt`)**
```text
다음은 소송기록 전체에서 추출한 이벤트와 사건 정보 메모입니다. 이를 종합해 최종 분석을 작성하세요.

{②에서 추출한 이벤트 JSON 배열}
```

> 출력은 양쪽 모두 `json_schema`(strict)로 강제됩니다 — 추출 스키마/분석 스키마 전문은 [lib/analysis-schema.ts](../lib/analysis-schema.ts).

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
