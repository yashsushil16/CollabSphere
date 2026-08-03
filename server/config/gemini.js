import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

let genAI = null;
let geminiModel = null;

const geminiKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : '';

if (geminiKey && geminiKey !== 'your_gemini_api_key_here') {
  try {
    genAI = new GoogleGenerativeAI(geminiKey);
    // Use gemini-2.0-flash or gemini-1.5-pro
    geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    console.log('[Gemini SDK] Gemini 2.0 Flash initialized successfully with API Key.');
  } catch (err) {
    console.warn('[Gemini SDK] Failed to initialize:', err.message);
  }
} else {
  console.log('[Gemini SDK] No GEMINI_API_KEY provided.');
}

export { genAI, geminiModel };
