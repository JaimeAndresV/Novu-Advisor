# Why the chat can be slow sometimes

The time until the user sees a reply is the sum of several steps. Below are the main causes and what we did to reduce delay where possible.

## 1. **AI provider API (main cause)**

The biggest delay is the call to OpenAI, Anthropic, or Gemini. The server sends the system prompt + history + user message and waits for the full reply. There is no streaming yet, so the user waits for the entire response.

- **Typical latency:** 2–10+ seconds depending on model, prompt size, and provider load.
- **What you can do:** Use a faster model when possible (e.g. `gpt-4o-mini`, `claude-3-5-haiku`, `gemini-1.5-flash`). Shorter custom instructions and fewer/smaller knowledge chunks also help.

## 2. **Web search (when triggered)**

When the user message matches “web search” triggers (e.g. “market price”, “latest”, “trend”, “competitor”, “ley”), the server calls Serper before calling the AI. That adds latency only for those messages.

- **Timeout:** 6 seconds (reduced from 12 so slow Serper fails faster).
- **Effect:** Up to ~6 s extra only when web search is used.

## 3. **Lead notification (fixed)**

When a new lead is captured, the server used to wait for the email notification (SMTP) before sending the chat response. That could add 1–5+ seconds.

- **Change:** Notifications are now sent in the background (fire-and-forget). The chat response is sent as soon as the AI replies; the user no longer waits for the email.

## 4. **RAG / knowledge search**

The server loads and scores knowledge chunks (up to 500 per business) in memory. This is usually under a few hundred milliseconds. If you have very large chunks or many of them, consider reducing or trimming content.

## Summary

- **Stable version:** tag `stable-v1.0` (commit `01d64f8`).
- **Main delay:** AI API; use faster models and leaner prompts to improve.
- **Improvements made:** No blocking on lead email; shorter web search timeout.
