"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, KeyRound, UserPlus } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If user is already authenticated, redirect straight to main page
  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (token) {
      router.replace("/");
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

    try {
      const res = await fetch(`${apiUrl}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Authentication request failed");
      }

      if (data.token) {
        localStorage.setItem("auth_token", data.token);
        if (data.user) {
          localStorage.setItem("auth_user", JSON.stringify(data.user));
        }
        window.dispatchEvent(new Event("auth-changed"));
        router.push("/");
      }
    } catch (err: any) {
      setError(err.message || "Unable to complete request. Please verify server connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center py-10 px-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center space-x-1.5 font-mono text-xs text-[#888888] px-2.5 py-1 rounded bg-[#161616] border border-[#262626] mb-1">
            <span>//</span>
            <span>auth:gate</span>
          </div>
          <h1 className="text-2xl font-mono font-medium tracking-tight text-[#ededed]">
            Technical Interview Engine
          </h1>
          <p className="text-xs font-mono text-[#888888]">
            Sign in or register to access the resume analyzer &amp; voice interview agent
          </p>
        </div>

        {/* Auth Card */}
        <div className="p-6 rounded-lg bg-[#161616] border border-[#262626] space-y-5">
          {/* Mode Switcher Tabs */}
          <div className="flex p-1 rounded-md bg-[#121212] border border-[#222222]">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError(null);
              }}
              className={`flex-1 py-1.5 text-xs font-mono font-medium rounded transition-all flex items-center justify-center space-x-1.5 ${
                mode === "login"
                  ? "bg-[#242424] text-[#ededed] shadow-sm"
                  : "text-[#888888] hover:text-[#cccccc]"
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setError(null);
              }}
              className={`flex-1 py-1.5 text-xs font-mono font-medium rounded transition-all flex items-center justify-center space-x-1.5 ${
                mode === "register"
                  ? "bg-[#242424] text-[#ededed] shadow-sm"
                  : "text-[#888888] hover:text-[#cccccc]"
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Create Account</span>
            </button>
          </div>

          {error && (
            <div className="p-3 rounded bg-[#1c1212] border border-[#442222] text-[#f44336] text-xs font-mono leading-relaxed">
              [error]: {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-mono text-[#888888]">
                EMAIL ADDRESS
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="developer@domain.com"
                className="w-full rounded-md bg-[#121212] border border-[#262626] p-2.5 text-[#ededed] placeholder-[#555555] focus:outline-none focus:border-[#0070f3] text-sm font-sans transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-mono text-[#888888]">
                PASSWORD
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full rounded-md bg-[#121212] border border-[#262626] p-2.5 text-[#ededed] placeholder-[#555555] focus:outline-none focus:border-[#0070f3] text-sm font-sans transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-md bg-[#0070f3] hover:bg-[#0060df] disabled:opacity-50 text-white font-mono text-xs font-medium flex items-center justify-center space-x-2 transition-colors cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <span>{mode === "login" ? "Sign In" : "Register Account"}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer info */}
        <p className="text-center font-mono text-[11px] text-[#555555]">
          secured via bcrypt + postgresql + jwt
        </p>
      </div>
    </div>
  );
}