import { geminiModel } from '../config/gemini.js';
import groqClient from '../config/groq.js';
import { getDomainKnowledgeContext } from './vectorService.js';

let geminiCooldownUntil = 0;

/**
 * Audit real transcript statements or chat messages using Groq Llama 3 (Fast, high-rate-limit) with Gemini fallback
 */
export async function auditStatement(statement, speakerName, roomId) {
  if (!statement || statement.trim().length < 5) {
    return { isFlagged: false };
  }

  const contextDocs = getDomainKnowledgeContext(roomId);
  const prompt = `
You are an expert real-time fact-checker for an ongoing meeting platform.
Speaker: "${speakerName}"
Statement: "${statement}"
Domain Knowledge Base Context: "${contextDocs || 'No uploaded domain documents provided.'}"

Task: Determine if the statement contains factual inaccuracies, false metrics, hallucinated claims, or contradicts the uploaded domain context.
Return strictly valid JSON with no markdown codeblocks:
{
  "isFlagged": boolean,
  "verdict": "TRUE" | "FALSE" | "UNVERIFIED",
  "statement": "${statement.replace(/"/g, '\\"')}",
  "correction": "String explaining correction if flagged, or empty string",
  "confidence": number between 0 and 1
}
`;

  // 1. Primary: Use Groq Llama 3 (Sub-200ms, high free-tier rate limits)
  if (groqClient) {
    try {
      const completion = await groqClient.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are a factual audit engine. Return only JSON.' },
          { role: 'user', content: prompt },
        ],
        model: 'llama-3.1-8b-instant',
        response_format: { type: 'json_object' },
        temperature: 0.1,
      });

      const parsed = JSON.parse(completion.choices[0].message.content);
      return {
        flagId: `flag_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        speakerName,
        statement: statement,
        verdict: parsed.verdict || (parsed.isFlagged ? 'FALSE' : 'TRUE'),
        correction: parsed.correction || '',
        confidence: parsed.confidence || 0.9,
        isFlagged: Boolean(parsed.isFlagged),
        timestamp: Date.now(),
      };
    } catch (err) {
      console.warn('[Groq Audit Warning, falling back to Gemini]:', err.message);
    }
  }

  // 2. Secondary: Gemini 2.0 Flash (with 60s cooldown on 429 rate limit)
  if (geminiModel && Date.now() > geminiCooldownUntil) {
    try {
      const result = await geminiModel.generateContent(prompt);
      const rawText = result.response.text().trim();
      const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
      const parsed = JSON.parse(cleaned);

      return {
        flagId: `flag_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        speakerName,
        statement: statement,
        verdict: parsed.verdict || (parsed.isFlagged ? 'FALSE' : 'TRUE'),
        correction: parsed.correction || '',
        confidence: parsed.confidence || 0.9,
        isFlagged: Boolean(parsed.isFlagged),
        timestamp: Date.now(),
      };
    } catch (err) {
      if (err.message.includes('429') || err.message.includes('Quota')) {
        console.warn('[Gemini Rate Limit 429] Entering 60s cooldown. Using Groq/Rule engine.');
        geminiCooldownUntil = Date.now() + 60000;
      } else {
        console.warn('[Gemini Fact Audit Error]:', err.message);
      }
    }
  }

  return { isFlagged: false };
}
