# Ajent API

Ajent API is a modular, extensible Node.js API server for interacting with Large Language Models (LLMs) such as OpenAI (GPT-4) and Google Gemini (Vertex AI). It provides a unified HTTP interface for chat, streaming, and speech-to-text (STT) operations, with built-in support for retries, error handling, and custom hooks.

## Features

- **Unified API** for multiple LLM providers (OpenAI, Vertex AI/Gemini, and more)
- **Chat completions** (single and streaming)
- **Speech-to-text** (audio transcription via OpenAI Whisper)
- **Pluggable architecture**: easily add new LLM providers
- **Custom hooks** for request/response/error handling
- **File upload support** for audio transcription
- **Robust retry logic** with exponential backoff and error simulation
- **TypeScript-friendly** (JSDoc types)
- **Easy to embed or run standalone**

## Quick Start

### 1. Install dependencies

```bash
npm install ajent-api
```

### 2. Set up environment variables

For OpenAI:
- `AJENT_LLM_TOKEN` — Your OpenAI API key

For Vertex AI (Gemini):
- `GOOGLE_APPLICATION_CREDENTIALS` — Path to your Google Cloud service account JSON
- `AJENT_LLM_PROJECT` — Your Google Cloud project ID

### 3. Start the server

You can create a simple server using the provided API:

```js
const { createLLMServer } = require('ajent-api');

const server = createLLMServer({
  llmName: process.env.LLM_NAME || 'openai', // or 'gemini'
  llmToken: process.env.LLM_TOKEN,
  llmProject: process.env.LLM_PROJECT, // for Vertex AI
  llmLocation: process.env.LLM_LOCATION, // for Vertex AI
  llmModel: process.env.LLM_MODEL || 'gpt-4.1' // or Gemini model name
  port: process.env.PORT || 3000
});

server.start();
```

Or run your own entrypoint that uses the API server.

### 4. API Endpoints

All endpoints are mounted under `/agent`:

#### `POST /agent/message`
- **Body:** `{ messages: [...], tools?: [...] }`
- **Response:** `{ message: ... }`

#### `POST /agent/message/stream`
- **Body:** `{ messages: [...], tools?: [...] }`
- **Response:** [Server-Sent Events (SSE) stream]

#### `POST /agent/audio_message`
- **Form-data:** `audio` (file upload)
- **Response:** `{ transcription: ... }`

### 5. Customization

You can pass hooks to customize request/response/error handling:

```js
const server = createLLMServer({
  beforeRequest: (req, res) => { /* ... */ },
  afterResponse: (req, response) => { /* ... */ },
  errorHandler: (err, req, res) => { /* ... */ }
});
```

## Project Structure

- `src/api/factory-api-server.js` — Main API server factory
- `src/llm/llm-client.js` — Abstract LLM client (retry logic, error handling)
- `src/openai/openai-client.js` — OpenAI implementation
- `src/gemini/vertexai-client.js` — Vertex AI (Gemini) implementation
- `src/llm/response-serializer.js` — Response serialization utilities
- `src/utils/` — Utility modules (logger, converters, etc.)

## Testing

Run tests with:

```bash
npm test
```

## License

MIT

---

**Ajent API** — Unified, extensible LLM API server for modern AI applications.
