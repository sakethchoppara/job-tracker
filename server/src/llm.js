// Thin provider abstraction: Claude (default) or Gemini, picked by LLM_PROVIDER or whichever key is set.
import { z } from 'zod';

function resolveProvider() {
  const explicit = process.env.LLM_PROVIDER?.toLowerCase();
  if (explicit) return explicit;
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  return null;
}

const DEFAULT_MODELS = {
  anthropic: 'claude-sonnet-5-5',
  gemini: 'gemini-2.5-flash',
};

export function llmInfo() {
  const provider = resolveProvider();
  return { provider, model: provider ? process.env.LLM_MODEL || DEFAULT_MODELS[provider] : null };
}

let anthropicClient;
let geminiClient;

async function completeAnthropic(system, prompt, { maxTokens, model, pdf }) {
  if (!anthropicClient) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    anthropicClient = new Anthropic();
  }
  const res = await anthropicClient.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{
      role: 'user',
      content: pdf
        ? [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf.toString('base64') } },
          { type: 'text', text: prompt },
        ]
        : prompt,
    }],
  });
  if (res.stop_reason === 'max_tokens') throw new Error('The AI reply was cut off (output token limit reached)');
  return res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
}

// Gemini 2.5 thinks before answering and that thinking counts toward maxOutputTokens,
// so it gets its own budget on top of the answer's.
const GEMINI_THINKING_BUDGET = 2048;

async function completeGemini(system, prompt, { maxTokens, model, jsonSchema, pdf }) {
  if (!geminiClient) {
    const { GoogleGenAI } = await import('@google/genai');
    geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  const res = await geminiClient.models.generateContent({
    model,
    contents: pdf
      ? [{ role: 'user', parts: [{ inlineData: { mimeType: 'application/pdf', data: pdf.toString('base64') } }, { text: prompt }] }]
      : prompt,
    config: {
      systemInstruction: system,
      maxOutputTokens: maxTokens + GEMINI_THINKING_BUDGET,
      thinkingConfig: { thinkingBudget: GEMINI_THINKING_BUDGET },
      ...(jsonSchema ? { responseMimeType: 'application/json', responseJsonSchema: jsonSchema } : {}),
    },
  });
  if (res.candidates?.[0]?.finishReason === 'MAX_TOKENS') throw new Error('The AI reply was cut off (output token limit reached)');
  return res.text ?? '';
}

/** `pdf` (Buffer) is attached as a document both providers read natively — layout and scanned pages included. */
export async function completeText(system, prompt, { maxTokens = 8000, jsonSchema, pdf } = {}) {
  const { provider, model } = llmInfo();
  if (!provider) {
    throw new Error('No LLM configured. Set ANTHROPIC_API_KEY or GEMINI_API_KEY in server/.env');
  }
  if (provider === 'anthropic') return completeAnthropic(system, prompt, { maxTokens, model, pdf });
  if (provider === 'gemini') return completeGemini(system, prompt, { maxTokens, model, jsonSchema, pdf });
  throw new Error(`Unknown LLM_PROVIDER "${provider}"`);
}

export function parseReply(text, schema) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return { error: 'No JSON object found in the reply.' };
  let data;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch (e) {
    return { error: `Invalid JSON: ${e.message}` };
  }
  const result = schema.safeParse(data);
  return result.success ? { data: result.data } : { error: z.prettifyError(result.error) };
}

/** Asks for JSON matching a zod schema (enforced natively by Gemini), validates it, and retries once with the errors. */
export async function completeJSON(system, prompt, schema, opts = {}) {
  const { $schema, ...jsonSchema } = z.toJSONSchema(schema);
  let reply = await completeText(system, prompt, { ...opts, jsonSchema });
  let { data, error } = parseReply(reply, schema);
  if (error) {
    const retry = `${prompt}\n\nYour previous reply did not match the required JSON shape:\n${error}\nReturn only the corrected JSON object.`;
    reply = await completeText(system, retry, { ...opts, jsonSchema });
    ({ data, error } = parseReply(reply, schema));
  }
  if (error) throw new Error(`The AI reply did not match the expected format: ${error}`);
  return data;
}

export function stripFences(text) {
  return String(text ?? '')
    .replace(/^\s*```[a-z]*\s*\n/i, '')
    .replace(/\n\s*```\s*$/, '')
    .trim();
}
