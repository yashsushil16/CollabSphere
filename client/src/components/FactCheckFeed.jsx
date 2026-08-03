import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, CheckCircle2, HelpCircle, ChevronDown, ChevronUp, X } from 'lucide-react';

export default function FactCheckFeed({ factCheckFlags = [] }) {
  const [expanded, setExpanded] = useState({});
  const [dismissed, setDismissed] = useState({});

  const toggle = (id) => setExpanded((p) => ({ ...p, [id]: !p[id] }));
  const dismiss = (id, e) => { e.stopPropagation(); setDismissed((p) => ({ ...p, [id]: true })); };

  const active = factCheckFlags.filter((f) => !dismissed[f.flagId]);

  if (active.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-xs text-[var(--text-3)] text-center leading-relaxed">
          No issues detected.<br />
          Statements are being verified in real time.
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 space-y-2 overflow-y-auto h-full">
      <AnimatePresence>
        {active.map((flag, idx) => {
          const id = flag.flagId || `f_${idx}`;
          const isOpen = expanded[id] ?? false;
          const isFalse = flag.verdict === 'FALSE';
          const isUnverified = flag.verdict === 'UNVERIFIED';

          return (
            <motion.div
              key={id}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => toggle(id)}
              className={`p-3 rounded-lg border cursor-pointer transition-colors duration-100 ${
                isFalse
                  ? 'bg-accent-red/5 border-accent-red/20 hover:border-accent-red/40'
                  : isUnverified
                  ? 'bg-accent-amber/5 border-accent-amber/20 hover:border-accent-amber/40'
                  : 'bg-accent-green/5 border-accent-green/20 hover:border-accent-green/40'
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-medium text-[var(--text-1)]">
                  {isFalse ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-accent-red shrink-0" />
                  ) : isUnverified ? (
                    <HelpCircle className="w-3.5 h-3.5 text-accent-amber shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-accent-green shrink-0" />
                  )}
                  <span>{flag.speakerName}</span>
                  <span className={`ml-1 text-[10px] font-mono font-semibold ${
                    isFalse ? 'text-accent-red' : isUnverified ? 'text-accent-amber' : 'text-accent-green'
                  }`}>
                    {flag.verdict} · {Math.round(flag.confidence * 100)}%
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={(e) => dismiss(id, e)} className="p-1 rounded hover:bg-[var(--surface-hover)] text-[var(--text-3)] transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                  {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-[var(--text-3)]" /> : <ChevronDown className="w-3.5 h-3.5 text-[var(--text-3)]" />}
                </div>
              </div>

              {/* Details */}
              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2.5 pt-2.5 border-t border-[var(--border)] space-y-2 text-xs text-[var(--text-2)]">
                      <div>
                        <span className="text-[10px] font-semibold uppercase text-[var(--text-3)]">Claimed</span>
                        <p className="mt-0.5 pl-2.5 border-l-2 border-[var(--border)] italic">"{flag.statement}"</p>
                      </div>
                      {flag.correction && (
                        <div>
                          <span className="text-[10px] font-semibold uppercase text-[var(--text-3)]">Correction</span>
                          <p className="mt-0.5 text-[var(--text-1)] font-medium">{flag.correction}</p>
                        </div>
                      )}
                      {/* Confidence bar */}
                      <div>
                        <div className="flex justify-between text-[10px] font-mono text-[var(--text-3)] mb-1">
                          <span>Confidence</span>
                          <span>{Math.round(flag.confidence * 100)}%</span>
                        </div>
                        <div className="w-full h-1 bg-[var(--border)] rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.round(flag.confidence * 100)}%` }}
                            transition={{ duration: 0.4, ease: 'easeOut' }}
                            className={`h-full rounded-full ${isFalse ? 'bg-accent-red' : 'bg-accent-blue'}`}
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button onClick={(e) => e.stopPropagation()} className="text-[10px] font-medium text-accent-blue hover:underline">View Context</button>
                        <button onClick={(e) => dismiss(id, e)} className="text-[10px] font-medium text-[var(--text-3)] hover:underline">Dismiss</button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
