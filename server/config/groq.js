import Groq from 'groq-sdk';
import dotenv from 'dotenv';
dotenv.config();

let groqClient = null;

const groqKey = process.env.GROQ_API_KEY ? process.env.GROQ_API_KEY.trim() : '';

if (groqKey && groqKey !== 'your_groq_api_key_here') {
  try {
    groqClient = new Groq({ apiKey: groqKey });
    console.log('[Groq SDK] Initialized successfully with API Key.');
  } catch (err) {
    console.warn('[Groq SDK] Failed to initialize:', err.message);
  }
} else {
  console.log('[Groq SDK] No GROQ_API_KEY provided. In-memory fallback will be used.');
}

export default groqClient;
