import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, UploadCloud, Check, AlertCircle } from 'lucide-react';

export default function KnowledgeBaseModal({ roomId, isOpen, onClose }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    if (e.target.files?.[0]) {
      setSelectedFile(e.target.files[0]);
      setUploadStatus(null);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile || !roomId) return;
    setIsUploading(true);
    setUploadStatus(null);

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('roomId', roomId);

    const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

    try {
      const res = await fetch(`${SERVER_URL}/api/knowledge/upload`, { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok && data.success) {
        setUploadStatus({ type: 'success', message: `Uploaded "${data.filename}" — ${data.chunksCount} chunks indexed.` });
        setSelectedFile(null);
      } else {
        setUploadStatus({ type: 'error', message: data.error || 'Upload failed.' });
      }
    } catch (err) {
      setUploadStatus({ type: 'error', message: 'Network error: ' + err.message });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.15 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-4 shadow-xl select-none"
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--text-1)]">Upload Document</h3>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)] text-[var(--text-3)] transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs text-[var(--text-2)]">Upload PDF or text files to provide context for fact-checking and Q&A.</p>

          {/* Drop zone */}
          <form onSubmit={handleUpload} className="space-y-3">
            <div className="relative p-8 rounded-lg border-2 border-dashed border-[var(--border)] hover:border-[var(--text-3)] text-center cursor-pointer transition-colors group">
              <input type="file" accept=".pdf,.txt,.md" onChange={handleFileChange} className="absolute inset-0 opacity-0 cursor-pointer" />
              <UploadCloud className="w-8 h-8 text-[var(--text-3)] mx-auto mb-2 group-hover:text-[var(--text-2)] transition-colors" />
              <p className="text-xs font-medium text-[var(--text-1)]">
                {selectedFile ? selectedFile.name : 'Choose a file or drag here'}
              </p>
              <p className="text-[10px] text-[var(--text-3)] mt-1">PDF, TXT, or Markdown</p>
            </div>

            {uploadStatus && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-3 rounded-lg text-xs font-medium flex items-center gap-2 ${
                  uploadStatus.type === 'success'
                    ? 'bg-accent-green/10 text-accent-green border border-accent-green/20'
                    : 'bg-accent-red/10 text-accent-red border border-accent-red/20'
                }`}
              >
                {uploadStatus.type === 'success' ? <Check className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
                {uploadStatus.message}
              </motion.div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-medium text-[var(--text-2)] hover:bg-[var(--surface-hover)] transition-colors">
                Cancel
              </button>
              <button
                type="submit"
                disabled={!selectedFile || isUploading}
                className="px-4 py-2 rounded-lg bg-accent-blue hover:bg-blue-600 text-white text-xs font-semibold disabled:opacity-40 transition-colors flex items-center gap-1.5"
              >
                {isUploading && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {isUploading ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
