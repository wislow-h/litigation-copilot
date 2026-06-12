import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Litigation Copilot",
  description: "소송기록을 업로드하면 사건 타임라인과 행동 가이드를 제공합니다",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-6 py-4">
            <a href="/" className="text-xl font-bold tracking-tight">
              ⚖️ Litigation Copilot
            </a>
            <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
              Upstage vs OpenAI 비교 실험
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
        <footer className="mx-auto max-w-7xl px-6 pb-10 text-xs text-slate-400">
          본 서비스의 분석 결과는 AI가 생성한 참고 자료이며 법률 자문이 아닙니다.
        </footer>
      </body>
    </html>
  );
}
