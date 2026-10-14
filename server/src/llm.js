// LLM agents: an abstract Agent holds everything provider-independent (schema-validated JSON with one corrective
// retry, friendly quota errors); each subclass only knows how to send one request to its provider.
// Picked by LLM_PROVIDER (claude-agent-sdk | anthropic | gemini), else by whichever API key is set, else the Agent SDK.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { z } from 'zod';

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

export function stripFences(text) {
  return String(text ?? '')
    .replace(/^\s*```[a-z]*\s*\n/i, '')
    .replace(/\n\s*```\s*$/, '')
    .trim();
}

const cutOff = () => new Error('The AI reply was cut off (output token limit reached)');

export class Agent {
  constructor(model) {
    if (new.target === Agent) throw new TypeError('Agent is abstract; use a provider subclass');
    this.model = model;
  }

  /**
   * Send one request and return the reply text. `jsonSchema` is a hint the provider may enforce natively;
   * `pdf` (Buffer) is a document the model should read. Subclasses must implement this.
   */
  // eslint-disable-next-line no-unused-vars
  async request(system, prompt, { maxTokens, jsonSchema, pdf }) {
    throw new Error(`${this.constructor.name} must implement request()`);
  }

  async completeText(system, prompt, { maxTokens = 8000, jsonSchema, pdf } = {}) {
    try {
      return await this.request(system, prompt, { maxTokens, jsonSchema, pdf });
    } catch (err) {
      if (/credit balance is too low/i.test(err.message)) {
        throw new Error('Your Anthropic API account has no credit. Add credits under Plans & Billing at console.anthropic.com, or change LLM_PROVIDER in server/.env.');
      }
      if (err.status !== 429) throw err;
      // Providers put their own wording in the message; Gemini includes "Please retry in 7h58m10.3s".
      const m = String(err.message).match(/retry in ((?:\d+h)?(?:\d+m)?)(\d+)(?:\.\d+)?s/i);
      const wait = m && `${m[1]}${m[2]}s`;
      throw new Error(`${this.model} quota or rate limit reached${wait ? `; it resets in about ${wait}` : ''}. Try again later, or change LLM_MODEL / LLM_PROVIDER in server/.env.`);
    }
  }

  /** Asks for JSON matching a zod schema, validates it, and retries once with the validation errors. */
  async completeJSON(system, prompt, schema, opts = {}) {
    const { $schema, ...jsonSchema } = z.toJSONSchema(schema);
    let reply = await this.completeText(system, prompt, { ...opts, jsonSchema });
    let { data, error } = parseReply(reply, schema);
    if (error) {
      const retry = `${prompt}\n\nYour previous reply did not match the required JSON shape:\n${error}\nReturn only the corrected JSON object.`;
      reply = await this.completeText(system, retry, { ...opts, jsonSchema });
      ({ data, error } = parseReply(reply, schema));
    }
    if (error) throw new Error(`The AI reply did not match the expected format: ${error}`);
    return data;
  }
}

/**
 * Claude via the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`), which runs the Claude Code engine in-process
 * on whatever login is on this machine. Each call is isolated: no tools beyond Read for a PDF, no filesystem
 * settings, hooks or MCP servers, and no saved session. Structured output uses the SDK's json_schema output format.
 */
export class ClaudeAgentSdkAgent extends Agent {
  static TIMEOUT_MS = 5 * 60 * 1000;

  async request(system, prompt, { jsonSchema, pdf }) {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    // `env` replaces the subprocess environment. Drop the markers Claude Code sets for its own children (so this
    // works when the server was started from inside Claude Code) and ANTHROPIC_API_KEY, which would bill that API
    // account instead of the machine's Claude login.
    const { CLAUDECODE, CLAUDE_CODE_ENTRYPOINT, ANTHROPIC_API_KEY, ...env } = process.env;
    const dir = await mkdtemp(path.join(tmpdir(), 'job-tracker-'));
    const abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(), ClaudeAgentSdkAgent.TIMEOUT_MS);
    try {
      let input = prompt;
      if (pdf) {
        const file = path.join(dir, 'document.pdf');
        await writeFile(file, pdf);
        input = `${prompt}\n\nThe document is the PDF at ${file}. Read it with the Read tool.`;
      }
      let result;
      for await (const message of query({
        prompt: input,
        options: {
          model: this.model,
          systemPrompt: system,
          cwd: dir,
          tools: pdf ? ['Read'] : [],
          allowedTools: pdf ? ['Read'] : [],
          settingSources: [],
          mcpServers: {},
          strictMcpConfig: true,
          persistSession: false,
          maxTurns: 6,
          env,
          abortController,
          ...(jsonSchema ? { outputFormat: { type: 'json_schema', schema: jsonSchema } } : {}),
        },
      })) {
        if (message.type === 'result') result = message;
      }
      if (!result) throw new Error('Claude Agent SDK returned no result');
      if (result.subtype !== 'success' || result.is_error) {
        const detail = result.subtype === 'success' ? result.result : (result.errors || []).join('; ') || result.subtype;
        throw Object.assign(new Error(`Claude Agent SDK: ${detail || 'request failed'}`), { status: result.api_error_status });
      }
      if (result.stop_reason === 'max_tokens') throw cutOff();
      return jsonSchema && result.structured_output != null ? JSON.stringify(result.structured_output) : result.result;
    } catch (err) {
      if (abortController.signal.aborted) throw new Error('Claude Agent SDK timed out');
      throw err;
    } finally {
      clearTimeout(timer);
      await rm(dir, { recursive: true, force: true });
    }
  }
}

export class AnthropicAgent extends Agent {
  async request(system, prompt, { maxTokens, pdf }) {
    this.client ??= new (await import('@anthropic-ai/sdk')).default();
    const res = await this.client.messages.create({
      model: this.model,
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
    if (res.stop_reason === 'max_tokens') throw cutOff();
    return res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  }
}

export class GeminiAgent extends Agent {
  // Gemini 2.5 thinks before answering and that thinking counts toward maxOutputTokens,
  // so it gets its own budget on top of the answer's.
  static THINKING_BUDGET = 2048;

  async request(system, prompt, { maxTokens, jsonSchema, pdf }) {
    this.client ??= new (await import('@google/genai')).GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const res = await this.client.models.generateContent({
      model: this.model,
      contents: pdf
        ? [{ role: 'user', parts: [{ inlineData: { mimeType: 'application/pdf', data: pdf.toString('base64') } }, { text: prompt }] }]
        : prompt,
      config: {
        systemInstruction: system,
        maxOutputTokens: maxTokens + GeminiAgent.THINKING_BUDGET,
        thinkingConfig: { thinkingBudget: GeminiAgent.THINKING_BUDGET },
        ...(jsonSchema ? { responseMimeType: 'application/json', responseJsonSchema: jsonSchema } : {}),
      },
    });
    if (res.candidates?.[0]?.finishReason === 'MAX_TOKENS') throw cutOff();
    return res.text ?? '';
  }
}

const AGENTS = {
  'claude-agent-sdk': { Agent: ClaudeAgentSdkAgent, model: 'sonnet' },
  'claude-code': { Agent: ClaudeAgentSdkAgent, model: 'sonnet' }, // older name for the same provider
  anthropic: { Agent: AnthropicAgent, model: 'claude-sonnet-5-5' },
  gemini: { Agent: GeminiAgent, model: 'gemini-2.5-flash' },
};

function resolveProvider() {
  const explicit = process.env.LLM_PROVIDER?.toLowerCase();
  if (explicit) return explicit;
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  return 'claude-agent-sdk';
}

export function llmInfo() {
  const provider = resolveProvider();
  return { provider, model: AGENTS[provider] ? process.env.LLM_MODEL || AGENTS[provider].model : null };
}

let cached;
export function getAgent() {
  const { provider, model } = llmInfo();
  if (!AGENTS[provider]) throw new Error(`Unknown LLM_PROVIDER "${provider}". Use one of: ${Object.keys(AGENTS).join(', ')}`);
  if (cached?.key !== `${provider}:${model}`) cached = { key: `${provider}:${model}`, agent: new AGENTS[provider].Agent(model) };
  return cached.agent;
}

// The functions the rest of the server uses.
export const completeText = (...args) => getAgent().completeText(...args);
export const completeJSON = (...args) => getAgent().completeJSON(...args);
