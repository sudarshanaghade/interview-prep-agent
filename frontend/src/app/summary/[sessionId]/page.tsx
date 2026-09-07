"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from "lucide-react";

interface QARecord {
  category: string;
  question: string;
  answer: string;
  score: number;
  correctness: boolean;
  missing_points: string[];
  model_answer: string;
}

interface CategoryBreakdown {
  name: string;
  avg_score: number;
  questions_count: number;
  is_weak: boolean;
  records: QARecord[];
}

interface SummaryData {
  total_questions: number;
  average_score: number;
  weak_topics: string[];
  category_breakdown: CategoryBreakdown[];
}

interface SessionData {
  session_id: string;
  categories: any[];
  history: QARecord[];
  weak_topics: string[];
  session_complete: boolean;
  summary_report?: string;
  summary_data?: SummaryData;
}

function ScoreBar({ score, isWeak }: { score: number; isWeak?: boolean }) {
  const pct = Math.round((score / 10) * 100);
  const color = isWeak ? "bg-[#ff9800]" : score >= 7 ? "bg-[#0070f3]" : "bg-[#888888]";
  return (
    <div className="flex items-center space-x-3">
      <div className="flex-1 h-1.5 rounded-sm bg-[#222222] overflow-hidden">
        <div
          className={`h-full rounded-sm transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-mono text-[#ededed] w-12 text-right">
        {score.toFixed(1)}/10
      </span>
    </div>
  );
}

function CollapsibleQACard({ record, idx }: { record: QARecord; idx: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg bg-[#161616] border border-[#262626] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-3 hover:bg-[#1c1c1c] transition-colors cursor-pointer"
      >
        <div className="flex items-center space-x-2.5 text-left min-w-0 pr-2">
          <span className="font-mono text-xs text-[#888888] shrink-0">
            [{String(idx + 1).padStart(2, "0")}]
          </span>
          <span className="text-xs font-mono font-medium text-[#ededed] truncate">
            {record.question}
          </span>
        </div>
        <div className="flex items-center space-x-2.5 shrink-0">
          <span
            className={`font-mono text-xs px-2 py-0.5 rounded border ${
              record.score >= 7
                ? "text-[#00c853] border-[#00c853]/30 bg-[#00c853]/10"
                : record.score >= 5
                ? "text-[#ff9800] border-[#ff9800]/30 bg-[#ff9800]/10"
                : "text-[#f44336] border-[#f44336]/30 bg-[#f44336]/10"
            }`}
          >
            {record.score}/10
          </span>
          {open ? (
            <ChevronUp className="w-3.5 h-3.5 text-[#666666]" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-[#666666]" />
          )}
        </div>
      </button>

      {open && (
        <div className="p-4 space-y-3 border-t border-[#242424] bg-[#141414]">
          <div className="space-y-1">
            <p className="text-[11px] font-mono text-[#888888] uppercase">YOUR RESPONSE</p>
            <div className="p-3 rounded bg-[#181818] border border-[#262626]">
              <p className="text-xs text-[#ededed] font-sans leading-relaxed whitespace-pre-wrap">
                {record.answer || "(No verbal answer recorded)"}
              </p>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-mono text-[#0070f3] uppercase">REFERENCE / MODEL ANSWER</p>
            <div className="p-3 rounded bg-[#181818] border-l-2 border-l-[#0070f3] border-y border-r border-[#262626]">
              <p className="text-xs text-[#cccccc] font-sans leading-relaxed whitespace-pre-wrap">
                {record.model_answer}
              </p>
            </div>
          </div>
          {record.missing_points && record.missing_points.length > 0 && (
            <div className="p-2.5 rounded bg-[#1c1612] border border-[#382618] text-xs font-mono text-[#ff9800]">
              <span className="font-bold mr-1">[gaps identified]:</span>
              {record.missing_points.join("; ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SummaryPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  const [data, setData] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/session/${sessionId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch summary data");
        return res.json();
      })
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError(err.message || "Could not load session summary.");
        setLoading(false);
      });
  }, [sessionId]);

  if (loading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center space-y-3 font-mono">
        <Loader2 className="w-6 h-6 animate-spin text-[#0070f3]" />
        <p className="text-[#888888] text-xs">compiling performance metrics...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center space-y-4 bg-[#161616] border border-[#262626] rounded-lg font-mono">
        <AlertTriangle className="w-8 h-8 text-[#f44336] mx-auto" />
        <h2 className="text-base font-medium text-[#ededed]">Summary Not Found</h2>
        <p className="text-[#888888] text-xs">{error || "No interview data available for this session."}</p>
        <button
          onClick={() => router.push("/")}
          className="py-2 px-4 rounded bg-[#1f1f1f] hover:bg-[#282828] border border-[#333333] text-[#ededed] text-xs cursor-pointer"
        >
          Return Home
        </button>
      </div>
    );
  }

  const sd = data.summary_data;
  const avgScore = sd
    ? sd.average_score
    : data.history.length > 0
    ? data.history.reduce((s, h) => s + h.score, 0) / data.history.length
    : 0;
  const weakTopics = sd ? sd.weak_topics : data.weak_topics;
  const categoryBreakdown: CategoryBreakdown[] = sd
    ? sd.category_breakdown
    : [];
  const totalQuestions = sd ? sd.total_questions : data.history.length;

  return (
    <div className="space-y-6 max-w-3xl mx-auto py-4">
      {/* Header */}
      <div className="space-y-1.5">
        <button
          onClick={() => router.push("/")}
          className="text-xs font-mono text-[#888888] hover:text-[#ededed] flex items-center space-x-1 mb-1 cursor-pointer transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>&lt;- new interview</span>
        </button>
        <h1 className="text-xl sm:text-2xl font-mono font-medium tracking-tight text-[#ededed]">
          Session Evaluation Report
        </h1>
        <p className="text-xs font-mono text-[#888888]">
          session: {sessionId}
        </p>
      </div>

      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-lg bg-[#161616] border border-[#262626]">
          <p className="text-[10px] font-mono text-[#666666] uppercase tracking-wider">AVERAGE SCORE</p>
          <p className="text-2xl font-mono font-medium text-[#ededed] mt-1">
            {avgScore.toFixed(1)} <span className="text-xs text-[#666666] font-normal">/ 10</span>
          </p>
        </div>

        <div className="p-4 rounded-lg bg-[#161616] border border-[#262626]">
          <p className="text-[10px] font-mono text-[#666666] uppercase tracking-wider">QUESTIONS ANSWERED</p>
          <p className="text-2xl font-mono font-medium text-[#ededed] mt-1">{totalQuestions}</p>
        </div>

        <div className="p-4 rounded-lg bg-[#161616] border border-[#262626]">
          <p className="text-[10px] font-mono text-[#666666] uppercase tracking-wider">WEAK TOPICS</p>
          <p className={`text-xs font-mono mt-2 truncate ${weakTopics.length > 0 ? "text-[#ff9800]" : "text-[#888888]"}`}>
            {weakTopics.length > 0 ? weakTopics.join(", ") : "None detected"}
          </p>
        </div>
      </div>

      {/* Per-Category Score Bars */}
      {categoryBreakdown.length > 0 && (
        <div className="p-4 rounded-lg bg-[#161616] border border-[#262626] space-y-3">
          <h2 className="text-[11px] font-mono uppercase tracking-wider text-[#666666]">
            CATEGORY BREAKDOWN
          </h2>
          <div className="space-y-3">
            {categoryBreakdown.map((cat, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center space-x-2">
                    <span className="text-[#ededed]">{cat.name}</span>
                    {cat.is_weak && (
                      <span className="text-[10px] px-1 rounded bg-[#ff9800]/15 text-[#ff9800] border border-[#ff9800]/30">
                        weak
                      </span>
                    )}
                  </div>
                  <span className="text-[#666666] text-[11px]">{cat.questions_count} q</span>
                </div>
                <ScoreBar score={cat.avg_score} isWeak={cat.is_weak} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detailed Q&A Breakdown */}
      <div className="space-y-2.5">
        <h2 className="text-[11px] font-mono uppercase tracking-wider text-[#666666]">
          QUESTION &amp; ANSWER EVALUATION ({data.history.length})
        </h2>

        {data.history.length === 0 ? (
          <p className="text-[#666666] text-xs font-mono italic">No evaluation records saved for this session.</p>
        ) : (
          <div className="space-y-2">
            {data.history.map((record, idx) => (
              <CollapsibleQACard key={idx} record={record} idx={idx} />
            ))}
          </div>
        )}
      </div>

      {/* Next Steps CTA */}
      <div className="p-4 rounded-lg bg-[#161616] border border-[#262626] space-y-3">
        <p className="text-[11px] font-mono uppercase tracking-wider text-[#666666]">ACTION</p>
        <div className="flex flex-wrap gap-2.5">
          {weakTopics.length > 0 && (
            <button
              onClick={() => {
                const topics = weakTopics.join(", ");
                sessionStorage.setItem("prefill_topics", topics);
                router.push("/");
              }}
              className="flex items-center space-x-2 py-2 px-3.5 rounded-md bg-[#1f1a14] hover:bg-[#282016] border border-[#ff9800]/40 text-[#ff9800] font-mono text-xs cursor-pointer transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Practice Weak Topics ({weakTopics.length})</span>
            </button>
          )}
          <button
            onClick={() => router.push("/")}
            className="py-2 px-4 rounded-md bg-[#0070f3] hover:bg-[#0060df] text-white font-mono text-xs font-medium cursor-pointer transition-colors"
          >
            Start New Interview
          </button>
        </div>
      </div>
    </div>
  );
}


