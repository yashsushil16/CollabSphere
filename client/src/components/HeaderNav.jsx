import React, { useState, useEffect } from 'react';
import { Clock, Users, Hash, ChevronRight, Copy, Check } from 'lucide-react';

export default function HeaderNav({ roomId, participantCount }) {
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setSecondsElapsed((p) => p + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const fmt = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const copyCode = () => {
    const code = roomId || 'architecture-review';
    const fullUrl = `${window.location.origin}/?room=${code}`;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <header className="h-12 sm:h-14 px-3 sm:px-5 flex items-center justify-between border-b border-[var(--border)] select-none shrink-0 safe-area-top">
      {/* Left — Room info */}
      <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 max-w-[65%]">
        <span className="text-xs sm:text-sm font-semibold text-[var(--text-1)] shrink-0">CollabSphere</span>
        <ChevronRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[var(--text-3)] shrink-0" />
        <button
          onClick={copyCode}
          title="Click to copy meeting code & link"
          className="text-xs sm:text-sm text-[var(--text-2)] hover:text-[var(--text-1)] font-mono flex items-center gap-1 truncate px-1.5 py-1 rounded hover:bg-[var(--surface-hover)] transition-colors"
        >
          <Hash className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0 text-accent-blue" />
          <span className="truncate">{roomId || 'meeting'}</span>
          {copied ? (
            <Check className="w-3 h-3 text-accent-green shrink-0 ml-1" />
          ) : (
            <Copy className="w-3 h-3 text-[var(--text-3)] shrink-0 ml-1 opacity-70" />
          )}
        </button>
      </div>

      {/* Right — Duration & participants */}
      <div className="flex items-center gap-3 sm:gap-4 text-xs text-[var(--text-2)] shrink-0">
        <span className="flex items-center gap-1 sm:gap-1.5 font-mono">
          <Clock className="w-3.5 h-3.5" />
          <span>{fmt(secondsElapsed)}</span>
        </span>
        <span className="flex items-center gap-1 sm:gap-1.5">
          <Users className="w-3.5 h-3.5" />
          <span>{participantCount}</span>
        </span>
      </div>
    </header>
  );
}
