"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CaseMeta, ProviderName } from "@/lib/types";

interface ProviderInfo {
  name: ProviderName;
  label: string;
  available: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  queued: "대기",
  parsing: "파싱 중",
  analyzing: "분석 중",
  done: "완료",
  error: "오류",
};

export default function HomePage() {
  const router = useRouter();
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [selected, setSelected] = useState<Set<ProviderName>>(new Set(["upstage", "openai"]));
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [cases, setCases] = useState<CaseMeta[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/providers")
      .then((r) => r.json())
      .then((list: ProviderInfo[]) => {
        setProviders(list);
        setSelected(new Set(list.filter((p) => p.available).map((p) => p.name)));
      });
    fetch("/api/cases")
      .then((r) => r.json())
      .then(setCases);
  }, []);

  const addFiles = useCallback((incoming: FileList | File[]) => {
    setFiles((prev) => [...prev, ...Array.from(incoming)]);
    setError("");
  }, []);

  async function submit() {
    if (files.length === 0 || selected.size === 0 || uploading) return;
    setUploading(true);
    setError("");

    const form = new FormData();
    // busboy가 파일보다 먼저 필드를 읽을 수 있도록 필드를 앞에 배치
    form.append("title", title);
    form.append("providers", Array.from(selected).join(","));
    for (const f of files) form.append("files", f);

    // XHR 사용: 대용량 업로드 진행률 표시
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/cases");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setUploading(false);
      if (xhr.status === 201) {
        const meta = JSON.parse(xhr.responseText) as CaseMeta;
        router.push(`/case/${meta.id}`);
      } else {
        try {
          setError(JSON.parse(xhr.responseText).error ?? "업로드 실패");
        } catch {
          setError("업로드 실패");
        }
      }
    };
    xhr.onerror = () => {
      setUploading(false);
      setError("네트워크 오류로 업로드에 실패했습니다");
    };
    xhr.send(form);
  }

  async function removeCase(id: string) {
    if (!confirm("이 사건과 업로드된 모든 파일을 삭제할까요?")) return;
    await fetch(`/api/cases/${id}`, { method: "DELETE" });
    setCases((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div className="space-y-10">
      <section className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">
          소송기록을 올리면, 내 상황이 보입니다
        </h1>
        <p className="mt-2 text-slate-500">
          소장·판결문·준비서면 등을 업로드하면 사건 타임라인과 지금 할 수 있는 선택지를
          쉬운 말로 알려드립니다.
        </p>
      </section>

      <section className="mx-auto max-w-3xl space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            addFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition ${
            dragOver ? "border-indigo-400 bg-indigo-50" : "border-slate-300 hover:border-indigo-300"
          }`}
        >
          <p className="text-lg font-medium">파일을 끌어다 놓거나 클릭해서 선택</p>
          <p className="mt-1 text-sm text-slate-500">
            PDF(스캔본 포함)·이미지·DOCX·HWP — 파일당 최대 200MB, 여러 개 가능
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            accept=".pdf,.jpg,.jpeg,.png,.bmp,.tiff,.heic,.webp,.docx,.hwp,.hwpx"
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
        </div>

        {files.length > 0 && (
          <ul className="space-y-1">
            {files.map((f, i) => (
              <li key={i} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <span className="truncate">{f.name}</span>
                <span className="ml-3 flex shrink-0 items-center gap-3 text-slate-400">
                  {(f.size / 1024 / 1024).toFixed(1)}MB
                  <button
                    onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                    className="text-slate-400 hover:text-red-500"
                  >
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="사건 이름 (선택, 예: 대여금 반환 소송)"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
        />

        <div className="flex flex-wrap items-center gap-4">
          <span className="text-sm font-medium text-slate-600">분석 엔진:</span>
          {providers.map((p) => (
            <label
              key={p.name}
              className={`flex items-center gap-2 text-sm ${p.available ? "" : "opacity-40"}`}
            >
              <input
                type="checkbox"
                disabled={!p.available}
                checked={selected.has(p.name)}
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) next.add(p.name);
                  else next.delete(p.name);
                  setSelected(next);
                }}
              />
              {p.label}
              {!p.available && <span className="text-xs">(API 키 없음)</span>}
            </label>
          ))}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          onClick={submit}
          disabled={files.length === 0 || selected.size === 0 || uploading}
          className="w-full rounded-xl bg-indigo-600 py-3 font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-40"
        >
          {uploading ? `업로드 중… ${progress}%` : "업로드하고 분석 시작"}
        </button>
        <p className="text-center text-xs text-slate-400">
          업로드된 기록은 이 컴퓨터에만 저장되며, 분석을 위해 선택한 AI 제공사로만 전송됩니다.
        </p>
      </section>

      {cases.length > 0 && (
        <section className="mx-auto max-w-3xl">
          <h2 className="mb-3 text-lg font-semibold">내 사건</h2>
          <ul className="space-y-2">
            {cases.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
              >
                <a href={`/case/${c.id}`} className="min-w-0 flex-1">
                  <p className="truncate font-medium hover:text-indigo-600">{c.title}</p>
                  <p className="text-xs text-slate-400">
                    {new Date(c.createdAt).toLocaleString("ko-KR")} · 파일 {c.files.length}개
                  </p>
                </a>
                <div className="ml-4 flex shrink-0 items-center gap-2">
                  {Object.entries(c.pipelines).map(([name, p]) => (
                    <span
                      key={name}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        p.status === "done"
                          ? "bg-emerald-50 text-emerald-700"
                          : p.status === "error"
                            ? "bg-red-50 text-red-600"
                            : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {name} {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  ))}
                  <button
                    onClick={() => removeCase(c.id)}
                    className="text-slate-300 hover:text-red-500"
                    title="삭제"
                  >
                    🗑
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
