import groqClient from '../config/groq.js';
import { geminiModel } from '../config/gemini.js';

export async function generatePostSessionAnalytics(transcriptLogs = [], speakerStats = {}) {
  const formattedTranscript = transcriptLogs
    .map(
      (log) =>
        `[${new Date(log.timestamp).toLocaleTimeString()}] ${log.speakerName}: "${log.text}"`
    )
    .join('\n');

  // Compute actual speaker talk-time distribution
  const totalDuration = Object.values(speakerStats).reduce((a, b) => a + b, 0) || 1;
  const talkTimeDistribution = Object.entries(speakerStats).map(([name, seconds]) => ({
    name,
    seconds,
    percentage: Math.round((seconds / totalDuration) * 100) || 0,
  }));

  if (talkTimeDistribution.length === 0) {
    talkTimeDistribution.push({ name: 'Speaker', seconds: 0, percentage: 100 });
  }

  if (!formattedTranscript || formattedTranscript.trim().length === 0) {
    return {
      executiveSummary: "### Post-Session Summary\n\n* No audio transcript logs were recorded during this session.",
      topicTimeline: [
        {
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          topic: 'Session Conclusion',
          summary: 'Meeting completed without transcript entries.'
        }
      ],
      talkTimeDistribution,
      actionItems: []
    };
  }

  // 1. Synthesize via Groq Llama 3.3 70B
  if (groqClient) {
    try {
      const completion = await groqClient.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: `You are an executive meeting secretary. Analyze the real transcript below and return JSON with keys:
{
  "executiveSummary": "Markdown string highlighting key decisions made and unresolved debates.",
  "topicTimeline": [
    { "timestamp": "HH:MM", "topic": "Short Topic Title", "summary": "Brief summary" }
  ],
  "actionItems": [
    { "id": "act_1", "task": "Description of assigned task", "assignee": "Speaker Name", "completed": false }
  ]
}`
          },
          {
            role: 'user',
            content: `Real Meeting Transcript:\n${formattedTranscript}`
          }
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.1,
        response_format: { type: 'json_object' }
      });

      const parsed = JSON.parse(completion.choices[0].message.content);
      return {
        ...parsed,
        talkTimeDistribution,
      };
    } catch (err) {
      console.error('[Groq Post-Session Summary Error]:', err.message);
    }
  }

  // 2. Synthesize via Gemini Flash fallback
  if (geminiModel) {
    try {
      const prompt = `Analyze this real meeting transcript and return strict JSON:
{
  "executiveSummary": "Markdown summary of key decisions",
  "topicTimeline": [{"timestamp": "HH:MM", "topic": "Title", "summary": "Detail"}],
  "actionItems": [{"id": "act_1", "task": "Task detail", "assignee": "Name", "completed": false}]
}

Transcript:
${formattedTranscript}`;

      const result = await geminiModel.generateContent(prompt);
      const text = result.response.text().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
      const parsed = JSON.parse(text);
      return {
        ...parsed,
        talkTimeDistribution
      };
    } catch (err) {
      console.error('[Gemini Summary Error]:', err.message);
    }
  }

  return {
    executiveSummary: `### Executive Meeting Summary\n\n- Transcribed Segments: ${transcriptLogs.length}`,
    topicTimeline: [],
    talkTimeDistribution,
    actionItems: []
  };
}
