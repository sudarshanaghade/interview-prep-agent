"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, Sparkles, ArrowRight, Loader2, Sliders, ChevronDown, ChevronUp, Check } from "lucide-react";

export default function Home() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [mode, setMode] = useState<"resume" | "jd">("resume");
  const [file, setFile] = useState<File | null>(null);
  const [jobDescription, setJobDescription] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questionsPerCategory, setQuestionsPerCategory] = useState(2);
  const [maxFollowUps, setMaxFollowUps] = useState(2);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      router.replace("/login");
    } else {
      setIsAuthenticated(true);
    }
  }, [router]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleStartInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (mode === "resume") {
        if (!file) {
          setError("Please select a PDF or DOCX resume file.");
          setLoading(false);
          return;
        }

        const formData = new FormData();
        formData.append("file", file);
        formData.append("questions_per_category", String(questionsPerCategory));
        formData.append("max_follow_ups", String(maxFollowUps));
        if (jobDescription.trim()) {
          formData.append("job_description", jobDescription.trim());
        }

        const res = await fetch("http://localhost:8000/api/upload-resume", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || "Failed to process resume");
        }

        const data = await res.json();
        if (data.categories) {
          sessionStorage.setItem(
            `session_${data.session_id}_categories`,
            JSON.stringify(data.categories)
          );
        }
        sessionStorage.setItem(
          `session_${data.session_id}_q_per_cat`,
          String(questionsPerCategory)
        );
        router.push(`/briefing/${data.session_id}`);
      } else {
        if (!sourceText.trim()) {
          setError("Please enter a Job Description or interview topics.");
          setLoading(false);
          return;
        }

        const res = await fetch("http://localhost:8000/api/start-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source_text: sourceText,
            mode: "jd",
            questions_per_category: questionsPerCategory,
            max_follow_ups: maxFollowUps,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || "Failed to start interview session");
        }

        const data = await res.json();
        if (data.categories) {
          sessionStorage.setItem(
            `session_${data.session_id}_categories`,
            JSON.stringify(data.categories)
          );
        }
        sessionStorage.setItem(
          `session_${data.session_id}_q_per_cat`,
          String(questionsPerCategory)
        );
        router.push(`/briefing/${data.session_id}`);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred starting the interview.");
      setLoading(false);
    }
  };

  if (isAuthenticated === null) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center space-y-2.5 font-mono">
        <Loader2 className="w-5 h-5 animate-spin text-[#0070f3]" />
        <span className="text-xs text-[#888888]">verifying session...</span>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-3xl mx-auto py-8">
      {/* Hero Section */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center space-x-1.5 font-mono text-xs text-[#888888] px-2.5 py-1 rounded bg-[#161616] border border-[#242424] mb-2">
          <span>//</span>
          <span>technical interview engine</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-mono font-medium tracking-tight text-[#ededed]">
          Prepare for Technical Interviews
        </h1>
        <p className="text-sm text-[#888888] max-w-lg mx-auto leading-relaxed">
          Grounded in your resume projects and target role. Structured rounds, dynamic follow-ups, and instant real-time speech evaluation.
        </p>
      </div>

      {/* Mode Selection Segmented Control */}
      <div className="flex justify-center">
        <div className="inline-flex p-1 rounded-lg bg-[#161616] border border-[#262626]">
          <button
            type="button"
            onClick={() => setMode("resume")}
            className={`px-4 py-1.5 text-xs font-mono font-medium rounded-md flex items-center space-x-2 transition-all ${
              mode === "resume"
                ? "bg-[#282828] text-[#ededed] shadow-sm"
                : "text-[#888888] hover:text-[#cccccc]"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Resume-Grounded</span>
          </button>
          <button
            type="button"
            onClick={() => setMode("jd")}
            className={`px-4 py-1.5 text-xs font-mono font-medium rounded-md flex items-center space-x-2 transition-all ${
              mode === "jd"
                ? "bg-[#282828] text-[#ededed] shadow-sm"
                : "text-[#888888] hover:text-[#cccccc]"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Job Description / Topics</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-lg bg-[#1c1212] border border-[#442222] text-[#f44336] text-xs font-mono">
          [error]: {error}
        </div>
      )}

      {/* Form Area */}
      <form onSubmit={handleStartInterview} className="space-y-5">
        {mode === "resume" ? (
          <div className="space-y-4">
            {/* File Upload Box */}
            <div className="border border-[#262626] hover:border-[#383838] transition-colors rounded-lg p-6 text-center bg-[#161616]">
              <input
                type="file"
                accept=".pdf,.docx,.doc"
                id="resume-upload"
                onChange={handleFileChange}
                className="hidden"
              />
              <label
                htmlFor="resume-upload"
                className="cursor-pointer flex flex-col items-center justify-center space-y-2.5"
              >
                <div className="w-10 h-10 rounded-md bg-[#1f1f1f] text-[#888888] flex items-center justify-center border border-[#2c2c2c]">
                  {file ? <Check className="w-5 h-5 text-[#00c853]" /> : <Upload className="w-5 h-5" />}
                </div>
                <div>
                  <p className="text-sm font-medium text-[#ededed] font-mono">
                    {file ? file.name : "Select or drag resume file"}
                  </p>
                  <p className="text-xs text-[#666666] font-mono mt-0.5">
                    PDF or DOCX · up to 10MB
                  </p>
                </div>
              </label>
            </div>

            {/* Optional JD Input */}
            <div className="space-y-1.5">
              <label className="block text-xs font-mono text-[#888888]">
                TARGET JOB DESCRIPTION <span className="text-[#555555]">(OPTIONAL)</span>
              </label>
              <textarea
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder="Paste role requirements to cross-reference with your resume..."
                rows={4}
                className="w-full rounded-lg bg-[#161616] border border-[#262626] p-3 text-[#ededed] placeholder-[#555555] focus:outline-none focus:border-[#0070f3] text-sm font-sans transition-colors resize-y"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <label className="block text-xs font-mono text-[#888888]">
              JOB DESCRIPTION / INTERVIEW TOPICS
            </label>
            <textarea
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              placeholder="Paste job description or topics (e.g., Distributed Systems, System Design, React Performance)..."
              rows={6}
              className="w-full rounded-lg bg-[#161616] border border-[#262626] p-3 text-[#ededed] placeholder-[#555555] focus:outline-none focus:border-[#0070f3] text-sm font-sans transition-colors resize-y"
            />
          </div>
        )}

        {/* Configuration Accordion */}
        <div className="rounded-lg border border-[#262626] bg-[#161616] p-3.5">
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className="flex w-full items-center justify-between text-xs font-mono text-[#888888] hover:text-[#ededed] transition-colors"
          >
            <span className="flex items-center space-x-2">
              <Sliders className="w-3.5 h-3.5" />
              <span>CONFIG: SESSION DEPTH</span>
            </span>
            {showSettings ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showSettings && (
            <div className="mt-3.5 pt-3.5 border-t border-[#242424] grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-mono text-[#888888] mb-1.5">
                  QUESTIONS PER TOPIC
                </label>
                <div className="flex space-x-2">
                  {[1, 2, 3].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setQuestionsPerCategory(val)}
                      className={`flex-1 py-1.5 text-xs font-mono rounded border transition-all ${
                        questionsPerCategory === val
                          ? "bg-[#0070f3] border-[#0070f3] text-white font-medium"
                          : "bg-[#1f1f1f] border-[#2c2c2c] text-[#888888] hover:text-[#ededed]"
                      }`}
                    >
                      {val} {val === 2 ? "(default)" : ""}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-[#888888] mb-1.5">
                  FOLLOW-UP DEPTH
                </label>
                <div className="flex space-x-2">
                  {[
                    { label: "Off", val: 0 },
                    { label: "Standard", val: 2 },
                    { label: "Deep", val: 3 },
                  ].map((item) => (
                    <button
                      key={item.val}
                      type="button"
                      onClick={() => setMaxFollowUps(item.val)}
                      className={`flex-1 py-1.5 text-xs font-mono rounded border transition-all ${
                        maxFollowUps === item.val
                          ? "bg-[#0070f3] border-[#0070f3] text-white font-medium"
                          : "bg-[#1f1f1f] border-[#2c2c2c] text-[#888888] hover:text-[#ededed]"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Submit CTA */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 px-4 rounded-lg bg-[#0070f3] hover:bg-[#0060df] text-white font-mono text-sm font-medium flex items-center justify-center space-x-2 disabled:opacity-50 transition-colors cursor-pointer"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Analyzing Profile & Building Plan...</span>
            </>
          ) : (
            <>
              <span>Initialize Interview Session</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>
    </div>
  );
}

