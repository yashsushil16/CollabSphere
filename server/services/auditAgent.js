import { geminiModel } from '../config/gemini.js';
import groqClient from '../config/groq.js';
import { getDomainKnowledgeContext } from './vectorService.js';

// Global rate-limit state — prevents hammering either API
let geminiQuotaExhausted = false;  // Set true on 429, reset after cool-down
let geminiCoolDownUntil = 0;       // Timestamp until which Gemini is blocked
let lastGeminiCallAt = 0;
let lastGroqCallAt = 0;

const GEMINI_MIN_GAP_MS = 8000;  // Max ~7 RPM on free tier (safe margin)
const GROQ_MIN_GAP_MS = 2000;    // Groq is generous — 2s gap is fine

/**
 * Audit a statement for factual accuracy.
 *
 * Priority:
 *  1. Groq Llama 3.1 8B — fast, free, no quota issues → PRIMARY
 *  2. Gemini 2.0 Flash   — fallback only if Groq unavailable AND not rate-limited
 *
 * Changed from the previous design (Gemini primary) because:
 * - Gemini free tier has very tight RPM/RPD quotas (15 RPM, 1500 RPD)
 * - The audit loop fires every 90s but can accumulate many items
 * - Groq free tier is far more generous (30 RPM, 14400 RPD)
 */
export async function auditStatement(statement, speakerName, roomId) {
  if (!statement || statement.trim().length < 10) {
    return { isFlagged: false };
  }

  // Statements under 6 words are rarely worth auditing
  if (statement.trim().split(/\s+/).length < 6) {
    return { isFlagged: false };
  }

  const contextDocs = getDomainKnowledgeContext(roomId);
  const prompt = `You are an expert real-time fact-checker for a business meeting.
Speaker: "${speakerName}"
Statement: "${statement}"
Domain Context: "${contextDocs || 'No uploaded domain documents.'}"

Determine if the statement contains clear factual inaccuracies, false metrics, or contradictions.
Only flag statements that are CLEARLY and VERIFIABLY false — not opinions or uncertain claims.
Return ONLY valid JSON (no markdown, no code blocks):
{"isFlagged":boolean,"verdict":"TRUE"|"FALSE"|"UNVERIFIED","statement":"${statement.replace(/"/g, '\\"')}","correction":"explanation if flagged, else empty string","confidence":0.0}`;

  // ── PRIMARY: Groq Llama 3.1 8B (fast, generous free tier) ─────────────────
  if (groqClient) {
    const now = Date.now();
    const gap = now - lastGroqCallAt;
    if (gap < GROQ_MIN_GAP_MS) {
      await new Promise((r) => setTimeout(r, GROQ_MIN_GAP_MS - gap));
    }
    lastGroqCallAt = Date.now();

    try {
      const completion = await groqClient.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are a factual audit engine. Return only valid JSON.' },
          { role: 'user', content: prompt },
        ],
        model: 'llama-3.1-8b-instant',
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 200,
      });

      const parsed = JSON.parse(completion.choices[0].message.content);
      return {
        flagId: `flag_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        speakerName,
        statement,
        verdict: parsed.verdict || (parsed.isFlagged ? 'FALSE' : 'TRUE'),
        correction: parsed.correction || '',
        confidence: parsed.confidence ?? 0.85,
        isFlagged: Boolean(parsed.isFlagged),
        timestamp: Date.now(),
      };
    } catch (err) {
      console.warn('[Audit Groq Error]:', err.message);
    }
  }

  // ── FALLBACK: Gemini 2.0 Flash (only if Groq failed AND quota not exhausted) ─
  if (geminiModel && !geminiQuotaExhausted && Date.now() > geminiCoolDownUntil) {
    const now = Date.now();
    const gap = now - lastGeminiCallAt;
    if (gap < GEMINI_MIN_GAP_MS) {
      await new Promise((r) => setTimeout(r, GEMINI_MIN_GAP_MS - gap));
    }
    lastGeminiCallAt = Date.now();

    try {
      const result = await geminiModel.generateContent(prompt);
      const rawText = result.response.text().trim();
      const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
      const parsed = JSON.parse(cleaned);

      return {
        flagId: `flag_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        speakerName,
        statement,
        verdict: parsed.verdict || (parsed.isFlagged ? 'FALSE' : 'TRUE'),
        correction: parsed.correction || '',
        confidence: parsed.confidence ?? 0.9,
        isFlagged: Boolean(parsed.isFlagged),
        timestamp: Date.now(),
      };
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
        // Back off for 30 minutes when quota is hit
        geminiQuotaExhausted = true;
        geminiCoolDownUntil = Date.now() + 30 * 60 * 1000;
        console.warn('[Audit] Gemini 429 quota hit — disabling for 30 minutes. Using Groq only.');
      } else {
        console.warn('[Audit Gemini Error]:', msg);
      }
    }
  }

  return { isFlagged: false };
}
