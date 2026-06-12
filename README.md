# Litigation Copilot

법률 지식이 없는 일반인을 위한 소송기록 분석 서비스.
소송기록(PDF·스캔본·HWP 등)을 업로드하면 사건 타임라인과 지금 선택할 수 있는 행동 옵션을 쉬운 말로 제공하며, **Upstage 파이프라인과 OpenAI 파이프라인의 결과를 나란히 비교**할 수 있습니다.

자세한 요구사항은 [PRD.md](./PRD.md) 참고.

## 실행 방법

```bash
cp .env.example .env   # API 키 입력 (둘 중 하나만 있어도 동작)
npm install
npm run dev            # http://localhost:3000
```

## 파이프라인 구성

| 단계 | Upstage | OpenAI |
|------|---------|--------|
| 문서 파싱 | Document Parse (`/v1/document-digitization`, 비동기·OCR·HWP 지원) | 없음 → Files API + Responses `input_file` (100p 초과 시 pdf-lib로 자동 분할) |
| 이벤트 추출 | Solar Pro 3 + JSON Schema (128K ctx, 청크 map-reduce) | GPT-5.5 + Structured Outputs (원본 문서 직접 판독) |
| 종합 분석 | Solar Pro 3 | GPT-5.5 |

두 파이프라인은 동일한 프롬프트([lib/prompts.ts](lib/prompts.ts))와 동일한 출력 스키마([lib/analysis-schema.ts](lib/analysis-schema.ts))를 사용해 공정하게 비교합니다.

**어떤 API를 어느 단계에서, 왜 골랐는지**는 [docs/API-DECISIONS.md](docs/API-DECISIONS.md)에 정리돼 있습니다.

## 구조

```
app/
  page.tsx                  # 업로드 + 사건 목록
  case/[id]/page.tsx        # 결과: 타임라인·옵션·비교 (2.5초 폴링)
  api/cases/route.ts        # 스트리밍 업로드(busboy) + 분석 시작
  api/cases/[id]/...        # 조회/삭제/재분석
lib/
  pipeline.ts               # 파이프라인 오케스트레이션 (백그라운드 병렬 실행)
  providers/upstage.ts      # 파싱 → 청크 추출 → 종합
  providers/openai.ts       # PDF 분할·업로드 → 추출 → 종합
  store.ts                  # 파일 기반 사건 저장소 (data/cases/{id}/)
```

- 업로드 파일과 분석 결과는 로컬 `data/` 에만 저장됩니다 (git 제외).
- 모델 오버라이드: `UPSTAGE_LLM_MODEL`, `OPENAI_MODEL` 환경변수.

> ⚠️ 본 서비스의 분석 결과는 법률 자문이 아닙니다.
