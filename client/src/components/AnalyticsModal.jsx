import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Clock, CheckSquare } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import ReactMarkdown from 'react-markdown';
import confetti from 'canvas-confetti';

const COLORS = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#06B6D4'];

export default function AnalyticsModal({ analyticsData, isOpen, onClose }) {
  const [actionItems, setActionItems] = useState([]);

  useEffect(() => {
    if (isOpen) confetti({ particleCount: 60, spread: 70, origin: { y: 0.6 } });
    if (analyticsData?.actionItems) setActionItems(analyticsData.actionItems);
  }, [isOpen, analyticsData]);

  if (!isOpen || !analyticsData) return null;

  const toggleItem = (id) =>
    setActionItems((p) => p.map((i) => (i.id === id ? { ...i, completed: !i.completed } : i)));

  const exportReport = () => {
    const md = `# Meeting Summary\n${new Date().toLocaleString()}\n\n${analyticsData.executiveSummary || ''}\n\n## Topics\n${(analyticsData.topicTimeline || []).map((t) => `- [${t.timestamp}] **${t.topic}**: ${t.summary}`).join('\n')}\n\n## Actions\n${actionItems.map((a) => `- [${a.completed ? 'x' : ' '}] ${a.task} (@${a.assignee})`).join('\n')}`;
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meeting-summary-${Date.now()}.md`;
    a.click();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.15 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-3xl bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 space-y-5 max-h-[90vh] flex flex-col shadow-xl select-none"
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[var(--text-1)]">Meeting Summary</h2>
            <div className="flex items-center gap-2">
              <button onClick={exportReport} className="px-3.5 py-1.5 rounded-lg bg-accent-blue hover:bg-blue-600 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors">
                <Download className="w-3.5 h-3.5" /> Export
              </button>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)] text-[var(--text-3)] transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="overflow-y-auto flex-1 space-y-5 pr-1">
            {/* Summary + Pie */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 p-4 rounded-lg border border-[var(--border)] space-y-2">
                <h3 className="text-xs font-semibold uppercase text-[var(--text-3)] tracking-wide">Summary</h3>
                <div className="prose prose-xs max-w-none dark:prose-invert text-[var(--text-2)] leading-relaxed">
                  <ReactMarkdown>{analyticsData.executiveSummary}</ReactMarkdown>
                </div>
              </div>

              <div className="p-4 rounded-lg border border-[var(--border)]">
                <h3 className="text-xs font-semibold uppercase text-[var(--text-3)] tracking-wide mb-2">Talk Time</h3>
                <div className="w-full h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={analyticsData.talkTimeDistribution || []} dataKey="percentage" nameKey="name" cx="50%" cy="50%" outerRadius={60} innerRadius={32} paddingAngle={3} strokeWidth={0}>
                        {(analyticsData.talkTimeDistribution || []).map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => [`${v}%`]} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '11px', color: 'var(--text-1)' }} />
                      <Legend wrapperStyle={{ fontSize: '10px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Topics */}
            <div className="p-4 rounded-lg border border-[var(--border)] space-y-2">
              <h3 className="text-xs font-semibold uppercase text-[var(--text-3)] tracking-wide flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Topics
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {(analyticsData.topicTimeline || []).map((item, i) => (
                  <div key={i} className="p-3 rounded-lg bg-[var(--canvas)] border border-[var(--border-subtle)] space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-[var(--text-1)]">{item.topic}</span>
                      <span className="font-mono text-[10px] text-[var(--text-3)]">{item.timestamp}</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-2)]">{item.summary}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Action Items */}
            <div className="p-4 rounded-lg border border-[var(--border)] space-y-2">
              <h3 className="text-xs font-semibold uppercase text-[var(--text-3)] tracking-wide flex items-center gap-1.5">
                <CheckSquare className="w-3.5 h-3.5" /> Action Items
              </h3>
              <div className="space-y-1.5">
                {actionItems.map((item) => (
                  <label key={item.id} className={`p-3 rounded-lg border flex items-center justify-between cursor-pointer transition-colors duration-100 ${
                    item.completed ? 'bg-accent-green/5 border-accent-green/15 text-[var(--text-3)] line-through' : 'border-[var(--border)] hover:border-[var(--text-3)]'
                  }`}>
                    <div className="flex items-center gap-2.5 text-xs font-medium">
                      <input type="checkbox" checked={!!item.completed} onChange={() => toggleItem(item.id)} className="w-3.5 h-3.5 accent-accent-blue cursor-pointer rounded" />
                      <span>{item.task}</span>
                    </div>
                    <span className="text-[10px] font-mono text-[var(--text-3)]">@{item.assignee}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
