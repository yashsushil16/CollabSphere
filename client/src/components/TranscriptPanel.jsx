import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Clock } from 'lucide-react';

export default function TranscriptPanel({ transcripts = [] }) {
  const [search, setSearch] = useState('');
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);

  const filtered = transcripts.filter(
    (t) =>
      t.text.toLowerCase().includes(search.toLowerCase()) ||
      t.speakerName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col">
      {/* Search */}
      <div className="px-4 pt-3 pb-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[var(--text-3)] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search transcripts..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] focus:border-[var(--text-3)] text-xs text-[var(--text-1)] placeholder-[var(--text-3)] outline-none transition-colors duration-150"
          />
        </div>
      </div>

      {/* Transcript list */}
      <div className="flex-1 overflow-y-auto px-4 pb-3 space-y-1">
        {filtered.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-xs text-[var(--text-3)] text-center leading-relaxed">
              {transcripts.length === 0 ? 'Waiting for speech...' : 'No matching results.'}
            </p>
          </div>
        ) : (
          <AnimatePresence>
            {filtered.map((item, idx) => (
              <motion.div
                key={item.chunkId || idx}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
                className="py-2.5 border-b border-[var(--border-subtle)] last:border-0"
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[11px] font-semibold text-accent-blue">{item.speakerName}</span>
                  <span className="text-[10px] font-mono text-[var(--text-3)] flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(item.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-2)] leading-relaxed">{item.text}</p>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
