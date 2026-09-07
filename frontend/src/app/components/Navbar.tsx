"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, User as UserIcon } from "lucide-react";

export default function Navbar() {
  const router = useRouter();
  const [user, setUser] = useState<{ id: number; email: string } | null>(null);

  const checkUser = () => {
    try {
      const stored = localStorage.getItem("auth_user");
      if (stored) {
        setUser(JSON.parse(stored));
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    }
  };

  useEffect(() => {
    checkUser();
    window.addEventListener("auth-changed", checkUser);
    window.addEventListener("storage", checkUser);
    return () => {
      window.removeEventListener("auth-changed", checkUser);
      window.removeEventListener("storage", checkUser);
    };
  }, []);

  const handleSignOut = () => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    setUser(null);
    window.dispatchEvent(new Event("auth-changed"));
    router.push("/login");
  };

  return (
    <header className="border-b border-[#222222] bg-[#111111]/90 backdrop-blur sticky top-0 z-50 px-6 py-3">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        <Link href="/" className="flex items-center space-x-2.5 group">
          <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-[#1f1f1f] border border-[#2e2e2e] text-[#ededed] font-medium tracking-wide">
            &gt;_
          </span>
          <span className="font-mono text-sm font-semibold tracking-tight text-[#ededed] group-hover:text-white transition-colors">
            interview<span className="text-[#888888]">.agent</span>
          </span>
        </Link>

        <div className="flex items-center space-x-3">
          {user ? (
            <div className="flex items-center space-x-2.5">
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-[#191919] text-[#cccccc] border border-[#2a2a2a] flex items-center space-x-1.5">
                <UserIcon className="w-3 h-3 text-[#0070f3]" />
                <span>{user.email}</span>
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                className="font-mono text-xs px-2 py-1 rounded bg-[#1c1212] hover:bg-[#251515] text-[#f44336] border border-[#442222] flex items-center space-x-1 transition-colors cursor-pointer"
                title="Sign out"
              >
                <LogOut className="w-3 h-3" />
                <span>Sign Out</span>
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="font-mono text-xs px-2.5 py-1 rounded bg-[#1f1f1f] hover:bg-[#282828] text-[#ededed] border border-[#333333] transition-colors"
            >
              Sign In
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}