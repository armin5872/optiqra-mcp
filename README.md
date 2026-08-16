# optiqra-mcp

An MCP (Model Context Protocol) server that exposes every tool in
[OptiQra](https://github.com/armin5872/OptiQra)'s API to MCP-compatible AI
clients (Claude Desktop, Claude Code, Cursor, etc.).

OptiQra has four HTTP endpoints. This server wraps all four as MCP tools:

| Tool                  | OptiQra endpoint      | What it does                                                              |
| ---------------------- | ---------------------- | -------------------------------------------------------------------------- |
| `optiqra_analyze`      | `POST /api/analyze`    | Crawls a URL and runs the full SEO/GEO/AEO/perf/a11y/security audit        |
| `optiqra_ai_fix`       | `POST /api/ai-fix`     | Generates an AI-written fix for one issue from a report                    |
| `optiqra_ai_insights`  | `POST /api/ai-insights`| Generates a site-wide AI strategy summary across a full report             |
| `optiqra_ai_test`      | `POST /api/ai-test`    | Verifies a provider/API key/model combo works before using the two above   |

By default it talks to the public demo, `https://optiqra.vercel.app`. Point
it at your own deployment (see OptiQra's own `DEPLOYMENT.md`/Docker setup)
with an env var — see below.

## Install

```bash
npm install
```

(or, once published, `npm install -g optiqra-mcp` / run directly with `npx optiqra-mcp`)

## Configuration (environment variables)

| Variable                  | Required | Purpose                                                                                   |
| -------------------------- | -------- | ------------------------------------------------------------------------------------------ |
| `OPTIQRA_BASE_URL`         | No       | Base URL of the OptiQra instance to call. Defaults to `https://optiqra.vercel.app`.        |
| `OPTIQRA_PROVIDER_API_KEY` | No       | A default AI-provider API key used by `optiqra_ai_fix`/`optiqra_ai_insights`/`optiqra_ai_test` if the model doesn't pass one. Recommended over letting the model handle the key in plaintext. |
| `OPTIQRA_TIMEOUT_MS`       | No       | Request timeout in ms. Defaults to `120000` (full-site crawls can be slow).                |

## Run it standalone

```bash
node src/index.js
```

It speaks MCP over stdio, so you won't see anything happen — it's waiting
for an MCP client to connect.

## Wire it into an MCP client

### Claude Desktop / Claude Code

Add to your MCP config (`claude_desktop_config.json`, or via `claude mcp add`
for Claude Code):

```json
{
  "mcpServers": {
    "optiqra": {
      "command": "node",
      "args": ["/absolute/path/to/optiqra-mcp/src/index.js"],
      "env": {
        "OPTIQRA_BASE_URL": "https://optiqra.vercel.app",
        "OPTIQRA_PROVIDER_API_KEY": "sk-..."
      }
    }
  }
}

Any other MCP-compatible client (Cursor, Windsurf, etc.) uses the same
`command`/`args`/`env` shape — check that client's docs for where the config
file lives.

## Notes on the AI-key tools

`optiqra_ai_fix`, `optiqra_ai_insights`, and `optiqra_ai_test` all need a
provider API key, exactly like pasting one into OptiQra's own UI — OptiQra's
server forwards it straight to the provider (OpenAI, Anthropic, Google, Groq,
OpenRouter, Mistral, DeepSeek, or xAI) and never stores it. This server does
the same: it never persists keys. Prefer setting `OPTIQRA_PROVIDER_API_KEY`
in your MCP client's env config over having the model pass a key through
chat.
