# DeepL JSON Translator API

A high-performance Node.js API to translate large JSON structures while preserving their structure.

## Features

- **Massive JSON Support**: Uses BullMQ for asynchronous processing.
- **DeepL Integration**: Official SDK with batching for speed.
- **Recursive Traversal**: Translates all string values in nested objects and arrays.
- **Callback Mechanism**: POSTs the result back to a callback URL when finished.
- **Error Handling**: Automatic retries with exponential backoff.
- **Monitoring Dashboard**: Integrated BullBoard for queue management.

## Tech Stack

- **Fastify**: Fast and low-overhead web framework.
- **BullMQ**: Reliable message queue based on Redis.
- **DeepL Node SDK**: Official library for DeepL API.
- **TypeScript**: Type-safe development.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file:
   ```env
   PORT=3000
   DEEPL_AUTH_KEY=your_deepl_api_key
   REDIS_URL=redis://localhost:6379
   ```

3. Build and Start:
   ```bash
   npm run build
   npm start
   ```

4. Start the Worker (can be in a separate process):
   ```bash
   npm run worker:dev # in development
   # OR
   node dist/worker.js # in production
   ```

## API Usage

### `POST /translate`

Request body:
```json
{
  "json": {
    "title": "Hello",
    "nested": { "text": "World" }
  },
  "sourceLang": "EN",
  "targetLang": "FR",
  "callbackUrl": "https://your-api.com/callback",
  "glossaryId": "optional-id",
  "metadata": { "any": "data" }
}
```

Response:
```json
{
  "message": "Translation job queued",
  "jobId": "1"
}
```

### Dashboard

Available at `http://localhost:3000/queues`.

## Deployment

### DigitalOcean App Platform

1. Push this repo to GitHub.
2. Create a new "App" on DigitalOcean.
3. Add two components:
   - **Web Service**: Command `npm start`.
   - **Worker**: Command `node dist/worker.js`.
4. Add a **Managed Redis** database and link it.
5. Set `DEEPL_AUTH_KEY` in environment variables.
