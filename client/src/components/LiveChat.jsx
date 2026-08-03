import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function LiveChat({
  chatMessages = [],
  isBotTyping = false,
  onSendMessage,
}) {
  const [inputText, setInputText] = useState('');
  const endRef = useRef(null);
  const isBotQuery = inputText.trimStart().startsWith('@bot');

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isBotTyping]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  return (
    <div className="h-full flex flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {chatMessages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-xs text-[var(--text-3)] text-center leading-relaxed">
              No messages yet.<br />
              Type <span className="font-mono text-[var(--text-2)]">@bot</span> to query the knowledge base.
            </p>
          </div>
        ) : (
          <AnimatePresence>
            {chatMessages.map((msg, i) => (
              <motion.div
                key={msg.id || i}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
                className={`flex flex-col ${msg.isBot ? 'items-start' : 'items-end'}`}
              >
                <div
                  className={`max-w-[88%] px-3.5 py-2.5 text-xs rounded-lg ${
                    msg.isBot
                      ? 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text-1)]'
                      : 'bg-accent-blue text-white'
                  }`}
                >
                  {/* Sender */}
                  <div className={`text-[10px] font-medium mb-1 ${msg.isBot ? 'text-[var(--text-3)]' : 'text-white/70'}`}>
                    {msg.isBot ? 'Assistant' : msg.speakerName}
                    {msg.isCached && <span className="ml-1.5 text-accent-green">(cached)</span>}
                  </div>
                  <div className="prose prose-xs max-w-none dark:prose-invert leading-relaxed">
                    {msg.isBot ? <ReactMarkdown>{msg.text}</ReactMarkdown> : <p className="whitespace-pre-wrap m-0">{msg.text}</p>}
                  </div>
                </div>
                <span className="text-[10px] text-[var(--text-3)] mt-1 px-1 font-mono">
                  {new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
        )}

        {isBotTyping && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-xs text-[var(--text-3)] py-2 px-1 flex items-center gap-2"
          >
            <span className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-3)] animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-3)] animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-3)] animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
            <span>Thinking...</span>
          </motion.div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="px-4 pb-4 pt-2">
        <div className="relative">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Message or @bot to ask..."
            className={`w-full pl-3.5 pr-10 py-2.5 rounded-lg bg-[var(--surface)] text-xs text-[var(--text-1)] placeholder-[var(--text-3)] outline-none transition-all duration-150 border ${
              isBotQuery
                ? 'border-accent-blue'
                : 'border-[var(--border)] focus:border-[var(--text-3)]'
            }`}
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-[var(--text-3)] hover:text-[var(--text-1)] disabled:opacity-30 transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </form>
    </div>
  );
}
