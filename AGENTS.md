# AGENTS.md

Welcome! This document provides operational context and guidelines for AI coding agents interacting with the `opf-email-responder` repository.

## Project Overview
This is a Google Apps Script project compiled from TypeScript. It scans the `help@opf.energy` inbox, reads context from Google Docs, and generates smart AI responses using Vertex AI (`gemini-3.1-pro-preview`). The script runs on a 1-minute time-driven trigger within the Google Workspace environment.

## Setup & Workflow Commands
- **Install dependencies:** `npm install`
- **Run tests:** `npm run test` (Uses Jest to validate filtering and logic paths)
- **Compile TypeScript:** `npm run build` (Uses esbuild to compile `src/` to `dist/`)
- **Deploy to Apps Script:** `npm run deploy` (Compiles code and runs `clasp push -f`)

## Architectural Patterns
- **Entry Point:** `src/main.ts` holds the execution logic (`processEmailsTick`) and the Apps Script trigger setup (`installTrigger`).
- **Configuration:** `src/config.ts` acts as the single source of truth for GCP project IDs, Document IDs, Ignore lists, and bot persona.
- **Email Logic:** `src/gmail.ts` handles reading threads, ignoring specified senders/domains, and enforcing escalation rate limits.
- **AI Backend:** `src/gemini.ts` manages the `UrlFetchApp` REST calls to Vertex AI and handles prompt construction based on Google Doc context.
- **Compiled Output:** The `dist/` directory is automatically generated. **Do not manually edit files in `dist/`**, as they will be overwritten during the next build.

## Testing & Quality
- **Unit Tests:** Always run `npm run test` after modifying any logic in `src/`. Ensure you update `tests/gmail.test.ts` or `tests/gemini.test.ts` if adding or modifying logic loops.
- **Mocking:** Tests heavily rely on mocking `GoogleAppsScript` global variables (like `GmailApp` and `ScriptApp`).

## Code Style & Conventions
- Ensure code is strictly typed with TypeScript.
- Follow existing patterns for error boundaries (i.e. catching errors without throwing them up to the top level unless intending to halt the current thread loop without marking it as read).
- Use native Apps Script services where applicable (e.g. `GmailApp` instead of a 3rd party REST client).

## Safety & Boundaries
- **NEVER** modify `.clasp.json`'s `scriptId` unless directly instructed to point to a new environment.
- Any modifications to the `UrlFetchApp` payload must respect the latest Vertex AI prompt object schema for `gemini-3.1-pro-preview`.
- Do not commit physical OAuth credentials or personal access tokens to this repository. All execution relies on the native `ScriptApp.getOAuthToken()` bound to the identity running the trigger.

---

## 🧭 When to Invoke Custom Skills

### `read-email` Skill
The `read-email` skill is registered locally under `.agent/skills/read-email/`. You should invoke this skill in the following scenarios:

1. **Investigating Recent Emails**:
   - Invoke when the user asks: *"What are the latest emails?"*, *"Tell me about recent messages"*, or requests status updates on current active threads. This ensures you provide real-time, accurate context.
2. **Validating Bot Behavior & Responses**:
   - Invoke when verifying if the bot processed an email correctly (e.g., drafted the correct reply, or naturally locked a thread by becoming the last sender). This lets you double-check the bot's live operations without relying on fragile read/unread flags.
3. **Debugging Specific Ticket Issues**:
   - Invoke when the user reports an issue with a specific ticket or thread. Use this skill with a targeted query (e.g., search by thread ID or sender address) to retrieve the exact conversation history.
4. **Monitoring Support Channels**:
   - Invoke when checking the current status or content of threads involving `help@opf.energy`.

---

## 🤖 Thread-State-Driven State Validation

The bot decides whether to reply to active threads strictly based on sender history rather than Gmail read/unread flags:
- **Bot Will Process**: Any thread where the customer was the last sender and no human staff member (`@opf.energy`) has replied.
- **Bot Will Skip**: Any thread where the bot or a human staff member (`@opf.energy`) is the last sender.

When using the `read-email` skill to debug responder behaviors, examine the **last message's sender** in the parsed output to verify if the thread is correctly locked or eligible for response.

> [!TIP]
> Always invoke the `read-email` skill to inspect the real-time state of Gmail threads when performing validation tasks, grounding your decisions in actual, verified inbox data rather than assumptions.

