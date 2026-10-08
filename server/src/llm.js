// LLM agents: an abstract Agent holds everything provider-independent (schema-validated JSON with one corrective
// retry, friendly quota errors); each subclass only knows how to send one request to its provider.
// Picked by LLM_PROVIDER (claude-code | anthropic | gemini), else by whichever API key is set, else Claude Code.
import { spawn } from 'node:child_process';
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

/** Runs the local `claude` CLI headless, on the user's Claude subscription; no API key needed. */
export class ClaudeCodeAgent extends Agent {
  static TIMEOUT_MS = 5 * 60 * 1000;

  async request(system, prompt, { jsonSchema, pdf }) {
    // Isolated run: no tools beyond reading the PDF, no user/project settings or hooks, no MCP servers, no saved session.
    const args = [
      '-p', '--output-format', 'json', '--model', this.model, '--system-prompt', system,
      '--no-session-persistence', '--setting-sources', '', '--strict-mcp-config', '--tools', pdf ? 'Read' : '',
    ];
    if (jsonSchema) args.push('--json-schema', JSON.stringify(jsonSchema));
    const dir = await mkdtemp(path.join(tmpdir(), 'job-tracker-'));
    try {
      let input = prompt;
      if (pdf) {
        const file = path.join(dir, 'document.pdf');
        await writeFile(file, pdf);
        args.push('--add-dir', dir, '--allowedTools', 'Read');
        input = `${prompt}\n\nThe document is the PDF at ${file}. Read it with the Read tool.`;
      }
      const res = JSON.parse(await runCli('claude', args, input, dir));
      if (res.is_error) {
        throw Object.assign(new Error(`Claude Code: ${res.result || res.subtype || 'request failed'}`), { status: res.api_error_status });
      }
      if (res.stop_reason === 'max_tokens') throw cutOff();
      return jsonSchema && res.structured_output ? JSON.stringify(res.structured_output) : res.result;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}

function runCli(cmd, args, input, cwd) {
  return new Promise((resolve, reject) => {
    // Drop the markers Claude Code sets for its own child processes, so the CLI also runs when the server
    // was started from inside a Claude Code session. Also hide ANTHROPIC_API_KEY (it may be in .env for the
    // anthropic provider): the CLI would bill that API account instead of the user's Claude subscription.
    const { CLAUDECODE, CLAUDE_CODE_ENTRYPOINT, ANTHROPIC_API_KEY, ...env } = process.env;
    const child = spawn(cmd, args, { cwd, env, timeout: ClaudeCodeAgent.TIMEOUT_MS });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => reject(e.code === 'ENOENT'
      ? new Error('Claude Code CLI not found. Install it and run `claude` once to log in, or pick another LLM_PROVIDER.')
      : e));
    child.on('close', (code, signal) => {
      if (code === 0) return resolve(out);
      // With --output-format json, failures still print a JSON result on stdout; let the caller read it.
      if (out.trim().startsWith('{')) return resolve(out);
      reject(new Error(signal ? `Claude Code timed out (${signal})` : `Claude Code exited with code ${code}: ${err.trim() || out.trim()}`));
    });
    child.stdin.end(input);
  });
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
  'claude-code': { Agent: ClaudeCodeAgent, model: 'sonnet' },
  anthropic: { Agent: AnthropicAgent, model: 'claude-sonnet-5-5' },
  gemini: { Agent: GeminiAgent, model: 'gemini-2.5-flash' },
};

function resolveProvider() {
  const explicit = process.env.LLM_PROVIDER?.toLowerCase();
  if (explicit) return explicit;
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  return 'claude-code';
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
