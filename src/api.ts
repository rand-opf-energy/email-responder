import { parseGmailMessages } from "./gmail";

/**
 * Dynamically fetches the debug secret from GCP Secret Manager in real-time.
 * Uses the script's native OAuth access token to authenticate securely.
 */
function fetchSecretFromSecretManager(): string {
  const token = ScriptApp.getOAuthToken();
  const url = "https://secretmanager.googleapis.com/v1/projects/opf-insight/secrets/EMAIL_RESPONDER_DEBUG_SECRET/versions/latest:access";
  
  const response = UrlFetchApp.fetch(url, {
    headers: {
      "Authorization": "Bearer " + token
    },
    muteHttpExceptions: false
  });
  
  const json = JSON.parse(response.getContentText());
  const base64Data = json.payload.data;
  const decodedBytes = Utilities.base64DecodeWebSafe(base64Data);
  return Utilities.newBlob(decodedBytes).getDataAsString().trim();
}

/**
 * Handles incoming HTTPS GET requests to the Web App endpoint.
 * Exposes a secure API to read emails for testing and validation.
 */
export function handleGetRequest(e: any): GoogleAppsScript.HTML.HtmlOutput | GoogleAppsScript.Content.TextOutput {
  let testSecret = "";
  try {
    testSecret = fetchSecretFromSecretManager();
  } catch (err: any) {
    return ContentService.createTextOutput(JSON.stringify({ error: `Failed to fetch secret from GCP: ${err.message}` }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  const clientSecret = e.parameter.secret;
  
  if (!clientSecret || clientSecret !== testSecret) {
    return ContentService.createTextOutput(JSON.stringify({ error: "Unauthorized" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  try {
    const action = e.parameter.action;
    if (action === "mark_unread") {
      const threadId = e.parameter.threadId;
      if (!threadId) {
        return ContentService.createTextOutput(JSON.stringify({ error: "Missing threadId" }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const thread = GmailApp.getThreadById(threadId);
      if (thread) {
        thread.markUnread();
        return ContentService.createTextOutput(JSON.stringify({ success: true, message: `Thread ${threadId} marked as unread.` }))
          .setMimeType(ContentService.MimeType.JSON);
      } else {
        return ContentService.createTextOutput(JSON.stringify({ error: `Thread ${threadId} not found.` }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }

    const query = e.parameter.query || "is:unread";
    const limit = parseInt(e.parameter.limit || "5", 10);
    
    const threads = (GmailApp as any).search(query, 0, limit);
    
    const parsedThreads = threads.map((thread: any) => {
      const messages = thread.getMessages();
      const parsedMessages = parseGmailMessages(messages);
      
      return {
        threadId: thread.getId(),
        subject: thread.getFirstMessageSubject(),
        messages: parsedMessages.map((msg: any) => ({
          id: msg.id,
          sender: msg.sender,
          recipient: msg.recipient,
          cc: msg.cc || "",
          subject: msg.subject,
          date: msg.date,
          body: msg.body
        }))
      };
    });
    
    return ContentService.createTextOutput(JSON.stringify({ threads: parsedThreads }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error: any) {
    return ContentService.createTextOutput(JSON.stringify({ error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Bind to global scope so exports.js can find it
(globalThis as any).handleGetRequest = handleGetRequest;
