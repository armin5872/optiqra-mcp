#!/usr/bin/env node
/**
 * optiqra-mcp
 *
 * MCP server that exposes OptiQra's website-audit HTTP API as MCP tools:
 *   - optiqra_analyze      -> POST /api/analyze
 *   - optiqra_ai_fix       -> POST /api/ai-fix
 *   - optiqra_ai_insights  -> POST /api/ai-insights
 *   - optiqra_ai_test      -> POST /api/ai-test
 *
 * By default it targets the public demo at https://optiqra.vercel.app.
 * Point it at a self-hosted instance with OPTIQRA_BASE_URL.
 *
 * AI-provider API keys (for optiqra_ai_fix / optiqra_ai_insights / optiqra_ai_test)
 * are passed through per-call, exactly as OptiQra's own UI does — this server
 * never stores them. Prefer setting OPTIQRA_PROVIDER_API_KEY in the MCP client's
 * env config over having the model pass a key in plaintext through chat.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE_URL = (process.env.OPTIQRA_BASE_URL || "https://optiqra.vercel.app").replace(/\/+$/, "");
const DEFAULT_PROVIDER_API_KEY = process.env.OPTIQRA_PROVIDER_API_KEY || undefined;
const REQUEST_TIMEOUT_MS = Number(process.env.OPTIQRA_TIMEOUT_MS || 120_000);

const server = new McpServer({
  name: "optiqra-mcp",
  version: "1.0.0",
});

/** POST helper with timeout + consistent error surfacing. */
async function postJson(path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
    if (!res.ok) {
      const message =
        (parsed && (parsed.error || parsed.message)) || `HTTP ${res.status} ${res.statusText}`;
      throw new Error(`OptiQra API error (${path}): ${message}`);
    }
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

function toolResult(data) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

function toolError(err) {
  return {
    content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
    isError: true,
  };
}

const providerEnum = z
  .enum(["openai", "anthropic", "google", "groq", "openrouter", "mistral", "deepseek", "xai"])
  .describe("AI provider to use for this request.");

// ---------------------------------------------------------------------------
// Tool: optiqra_analyze
// ---------------------------------------------------------------------------
server.registerTool(
  "optiqra_analyze",
  {
    title: "Analyze a website with OptiQra",
    description:
      "Crawls a website and runs OptiQra's full audit: SEO, GEO (generative engine " +
      "optimization), AEO (answer engine optimization), performance, accessibility, " +
      "security headers, structured data, links, images, and duplicate-content " +
      "detection. Returns a report with per-category scores and issue details. " +
      "This can take a while for larger sites since it crawls the whole site.",
    inputSchema: {
      url: z.string().url().describe("The URL of the website to analyze, e.g. https://example.com"),
    },
  },
  async ({ url }) => {
    try {
      const data = await postJson("/api/analyze", { url });
      return toolResult(data);
    } catch (err) {
      return toolError(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Tool: optiqra_ai_fix
// ---------------------------------------------------------------------------
server.registerTool(
  "optiqra_ai_fix",
  {
    title: "Generate an AI fix for an OptiQra issue",
    description:
      "Given a single issue from an OptiQra report (as produced by optiqra_analyze), " +
      "asks an AI provider to generate a suggested fix. Requires an API key for the " +
      "chosen provider — OptiQra forwards it directly to that provider and never " +
      "stores it server-side.",
    inputSchema: {
      provider: providerEnum,
      apiKey: z
        .string()
        .min(1)
        .optional()
        .describe(
          "API key for the chosen provider. Optional if OPTIQRA_PROVIDER_API_KEY is set in this server's environment."
        ),
      model: z.string().optional().describe("Optional specific model name to use for that provider."),
      issue: z
        .record(z.any())
        .describe("The issue object (from an optiqra_analyze report) to generate a fix for."),
    },
  },
  async ({ provider, apiKey, model, issue }) => {
    const key = apiKey || DEFAULT_PROVIDER_API_KEY;
    if (!key) {
      return toolError(
        new Error(
          "No API key provided. Pass `apiKey`, or set OPTIQRA_PROVIDER_API_KEY in the server environment."
        )
      );
    }
    try {
      const data = await postJson("/api/ai-fix", { provider, apiKey: key, model, issue });
      return toolResult(data);
    } catch (err) {
      return toolError(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Tool: optiqra_ai_insights
// ---------------------------------------------------------------------------
server.registerTool(
  "optiqra_ai_insights",
  {
    title: "Generate AI insights for an OptiQra report",
    description:
      "Given a full OptiQra report (as produced by optiqra_analyze), asks an AI " +
      "provider to generate a strategic, site-wide summary reasoning across all " +
      "audit categories and pages. Requires an API key for the chosen provider — " +
      "OptiQra forwards it directly to that provider and never stores it server-side.",
    inputSchema: {
      provider: providerEnum,
      apiKey: z
        .string()
        .min(1)
        .optional()
        .describe(
          "API key for the chosen provider. Optional if OPTIQRA_PROVIDER_API_KEY is set in this server's environment."
        ),
      model: z.string().optional().describe("Optional specific model name to use for that provider."),
      report: z.record(z.any()).describe("The full report object returned by optiqra_analyze."),
    },
  },
  async ({ provider, apiKey, model, report }) => {
    const key = apiKey || DEFAULT_PROVIDER_API_KEY;
    if (!key) {
      return toolError(
        new Error(
          "No API key provided. Pass `apiKey`, or set OPTIQRA_PROVIDER_API_KEY in the server environment."
        )
      );
    }
    try {
      const data = await postJson("/api/ai-insights", { provider, apiKey: key, model, report });
      return toolResult(data);
    } catch (err) {
      return toolError(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Tool: optiqra_ai_test
// ---------------------------------------------------------------------------
server.registerTool(
  "optiqra_ai_test",
  {
    title: "Test an OptiQra AI provider key",
    description:
      "Verifies that a given AI provider + API key + model combination is reachable " +
      "and working, before using optiqra_ai_fix or optiqra_ai_insights.",
    inputSchema: {
      provider: providerEnum,
      apiKey: z
        .string()
        .min(1)
        .optional()
        .describe(
          "API key for the chosen provider. Optional if OPTIQRA_PROVIDER_API_KEY is set in this server's environment."
        ),
      model: z.string().optional().describe("Optional specific model name to test."),
    },
  },
  async ({ provider, apiKey, model }) => {
    const key = apiKey || DEFAULT_PROVIDER_API_KEY;
    if (!key) {
      return toolError(
        new Error(
          "No API key provided. Pass `apiKey`, or set OPTIQRA_PROVIDER_API_KEY in the server environment."
        )
      );
    }
    try {
      const data = await postJson("/api/ai-test", { provider, apiKey: key, model });
      return toolResult(data);
    } catch (err) {
      return toolError(err);
    }
  }
);

// ---------------------------------------------------------------------------
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`optiqra-mcp running (stdio), target: ${BASE_URL}`);
}

main().catch((err) => {
  console.error("Fatal error starting optiqra-mcp:", err);
  process.exit(1);
});
