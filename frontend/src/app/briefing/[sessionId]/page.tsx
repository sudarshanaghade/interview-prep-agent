"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowRight,
  Loader2,
  CheckCircle2,
  Mic,
  AlertTriangle,
} from "lucide-react";

interface Category {
  category: string;
  source: string;
  reason: string;
}

function formatSourceLabel(source: string) {
  if (source.includes(":")) {
    const [type, name] = source.split(":", 2);
    return `${type}: ${name}`;
  }
  return source;
}

export default function BriefingPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  const [categories, setCategories] = useState<Category[]>([]);
  const [questionsPerCategory, setQuestionsPerCategory] = useState<number>(2);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [micStatus, setMicStatus] = useState<"idle" | "checking" | "ok" | "error">("idle");

  useEffect(() => {
    if (!sessionId) return;

    const cachedQ = sessionStorage.getItem("session_" + sessionId + "_q_per_cat");
    if (cachedQ) {
      setQuestionsPerCategory(parseInt(cachedQ, 10) || 2);
    }

    const cached = sessionStorage.getItem("session_" + sessionId + "_categories");
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setCategories(parsed);
        setLoading(false);
        return;
      } catch (_) {}
    }

    fetch((process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000") + "/api/session/" + sessionId)
      .then((res) => {
        if (!res.ok) throw new Error("Session not found");
        return res.json();
      })
      .then((data) => {
        setCategories(data.categories || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Could not load interview plan.");
        setLoading(false);
      });
  }, [sessionId]);

  const handleMicTest = async () => {
    setMicStatus("checking");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicStatus("ok");
    } catch (_) {
      setMicStatus("error");
    }
  };

  const handleStartInterview = () => {
    router.push("/interview/" + sessionId);
  };

  if (loading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center space-y-3 font-mono">
        <Loader2 className="w-6 h-6 animate-spin text-[#0070f3]" />
        <p className="text-[#888888] text-xs">generating interview plan...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center space-y-4 bg-[#161616] border border-[#262626] rounded-lg">
        <AlertTriangle className="w-8 h-8 text-[#f44336] mx-auto" />
        <h2 className="text-base font-mono font-medium text-[#ededed]">Plan Not Found</h2>
        <p className="text-[#888888] text-xs font-mono">{error}</p>
        <button
          onClick={() => router.push("/")}
          className="py-2 px-4 rounded bg-[#1f1f1f] hover:bg-[#282828] border border-[#333333] text-[#ededed] font-mono text-xs cursor-pointer"
        >
          Return Home
        </button>
      </div>
    );
  }

  const totalQuestions = categories.length * questionsPerCategory;

  return (
    <div className="space-y-6 max-w-3xl mx-auto py-6">
      {/* Header */}
      <div className="space-y-1.5">
        <div className="inline-flex items-center space-x-1.5 font-mono text-xs text-[#888888] px-2 py-0.5 rounded bg-[#161616] border border-[#262626]">
          <span className="text-[#00c853]">●</span>
          <span>plan:ready</span>
        </div>
        <h1 className="text-xl sm:text-2xl font-mono font-medium tracking-tight text-[#ededed]">
          Interview Plan &amp; Topics
        </h1>
        <p className="text-xs font-mono text-[#888888]">
          {categories.length} topic{categories.length !== 1 ? "s" : ""} · ~{totalQuestions} questions ({questionsPerCategory} per topic) · calibrated to profile
        </p>
      </div>

      {/* Category List */}
      <div className="space-y-2.5">
        <div className="text-[11px] font-mono uppercase tracking-wider text-[#666666]">
          TOPIC ROUNDS
        </div>
        {categories.map((cat, idx) => (
          <div
            key={idx}
            className="p-3.5 rounded-lg bg-[#161616] border border-[#262626] hover:border-[#333333] transition-colors flex items-start space-x-3"
          >
            <div className="font-mono text-xs text-[#666666] pt-0.5 w-6 text-center shrink-0">
              {String(idx + 1).padStart(2, "0")}
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-mono font-medium text-[#ededed] truncate">
                  {cat.category}
                </h3>
                <span className="font-mono text-[11px] text-[#888888] bg-[#1f1f1f] px-2 py-0.5 rounded border border-[#2a2a2a] shrink-0">
                  [{formatSourceLabel(cat.source)}]
                </span>
              </div>
              {cat.reason && (
                <p className="text-xs text-[#777777] font-sans leading-relaxed">
                  {cat.reason}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Microphone Check */}
      <div className="p-4 rounded-lg bg-[#161616] border border-[#262626] space-y-2.5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-mono font-medium text-[#ededed]">HARDWARE CHECK</p>
            <p className="text-xs text-[#777777] mt-0.5">Verify microphone capture before starting live voice session</p>
          </div>
          <button
            type="button"
            onClick={handleMicTest}
            disabled={micStatus === "checking" || micStatus === "ok"}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded text-xs font-mono transition-all cursor-pointer disabled:cursor-default ${
              micStatus === "ok"
                ? "bg-[#00c853]/10 border border-[#00c853]/40 text-[#00c853]"
                : micStatus === "error"
                ? "bg-[#f44336]/10 border border-[#f44336]/40 text-[#f44336]"
                : micStatus === "checking"
                ? "bg-[#1f1f1f] border border-[#2c2c2c] text-[#888888]"
                : "bg-[#1f1f1f] border border-[#2c2c2c] text-[#ededed] hover:border-[#383838]"
            }`}
          >
            {micStatus === "checking" ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>checking...</span>
              </>
            ) : micStatus === "ok" ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>mic ready</span>
              </>
            ) : micStatus === "error" ? (
              <>
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>no access</span>
              </>
            ) : (
              <>
                <Mic className="w-3.5 h-3.5" />
                <span>test audio</span>
              </>
            )}
          </button>
        </div>
        {micStatus === "error" && (
          <p className="text-xs text-[#f44336] bg-[#1c1212] border border-[#442222] rounded p-2 font-mono">
            [warn]: microphone access denied. Text fallback answers will be enabled.
          </p>
        )}
      </div>

      {/* Expectations / Guide */}
      <div className="p-4 rounded-lg bg-[#161616] border border-[#262626] space-y-2">
        <p className="text-[11px] font-mono uppercase tracking-wider text-[#666666]">
          PROTOCOL
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-[#888888] font-mono">
          <div className="p-2 rounded bg-[#141414] border border-[#222222]">
            <span className="text-[#ededed]">01. VOICE TURNS:</span> Interviewer speaks out loud. Speak clearly to answer.
          </div>
          <div className="p-2 rounded bg-[#141414] border border-[#222222]">
            <span className="text-[#ededed]">02. BARGE-IN:</span> Press Interrupt or speak to immediately stop the AI.
          </div>
          <div className="p-2 rounded bg-[#141414] border border-[#222222]">
            <span className="text-[#ededed]">03. EVALUATION:</span> Instant scoring &amp; gap analysis per answer.
          </div>
          <div className="p-2 rounded bg-[#141414] border border-[#222222]">
            <span className="text-[#ededed]">04. REPORT:</span> Comprehensive summary and weak spots upon completion.
          </div>
        </div>
      </div>

      {/* Start Button */}
      <button
        type="button"
        onClick={handleStartInterview}
        className="w-full py-3 px-4 rounded-lg bg-[#0070f3] hover:bg-[#0060df] text-white font-mono text-sm font-medium flex items-center justify-center space-x-2 transition-colors cursor-pointer"
      >
        <span>Begin Interview</span>
        <ArrowRight className="w-4 h-4" />
      </button>

      <p className="text-center font-mono text-[11px] text-[#555555]">
        session: {sessionId}
      </p>
    </div>
  );
}