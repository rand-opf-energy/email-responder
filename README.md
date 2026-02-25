# Email Responder

This project is a Google Apps Script that automatically analyzes incoming emails to a dedicated Google Workspace account and generates intelligent email replies using Vertex AI (Gemini).

## Architecture

* **Compute:** Google Apps Script natively running within the Google Workspace environment using a Time-Driven Trigger.
* **AI Backend:** Vertex AI (`gemini-3.1-pro-preview`) via REST API (`UrlFetchApp`).
* **Development/Tooling:** Uses `clasp` for local development, TypeScript, and version control.

## Setup Instructions

### 1. Prerequisites
* [Node.js](https://nodejs.org/) installed locally.
* A Google Workspace account with Google Apps Script API enabled (https://script.google.com/home/usersettings).
* `clasp` installed globally (`npm install -g @google/clasp`).

### 2. Authentication
Log in to `clasp` with the target Google Workspace account:
```bash
npx clasp login
```

### 3. Deployment
To push the local TypeScript code to the Google Apps Script project:
```bash
npx clasp push
```

To open the Apps Script editor in your browser:
```bash
npx clasp open
```
