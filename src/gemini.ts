import { CONFIG } from "./config";
import { ParsedThread } from "./gmail";

// Interfaces for Vertex AI REST API payloads
// Vertex requires a strict schema for the conversation history where roles are distinct.
interface VertexContent {
    role: "user" | "model";
    parts: { text: string }[];
}

interface VertexPayload {
    contents: VertexContent[];
    systemInstruction?: {
        parts: { text: string }[];
    };
    generationConfig?: {
        temperature?: number;
        maxOutputTokens?: number;
    };
}

/**
 * Calls the Vertex AI Gemini REST API to generate a response for an email thread.
 * 
 * @param thread The parsed email conversation history
 * @param thread The parsed email conversation history
 * @returns The generated response string from Gemini
 */
export function generateGeminiResponse(thread: ParsedThread): string {
    const botEmailAddress = Session.getEffectiveUser().getEmail();
    // Construct the conversation history for the Vertex API
    const contents: VertexContent[] = thread.messages.map((msg) => {
        const isBot = msg.sender.includes(botEmailAddress);
        let textForModel = msg.body;

        if (isBot) {
            // Strip the signature so the model doesn't learn to generate it in its raw responses.
            // We want the signature appended exclusively in main.ts, not by the model itself.
            const signatureIndex = textForModel.indexOf(`\n\n${CONFIG.SIGNATURE}`);
            if (signatureIndex !== -1) {
                textForModel = textForModel.substring(0, signatureIndex);
            }

            // Strip the appended quoted history starting with "\n\nOn " to save context window.
            // Gmail automatically appends earlier messages in the thread, but we are already
            // feeding the full parsed thread history into the model via `contents`.
            const quoteIndex = textForModel.lastIndexOf("\n\nOn ");
            if (quoteIndex !== -1) {
                textForModel = textForModel.substring(0, quoteIndex);
            }
        } else {
            // Only prefix text with the sender/date for user messages to give the model context
            textForModel = `[From: ${msg.sender} | Date: ${msg.date.toString()}]\n\n${textForModel}`;
        }

        return {
            role: isBot ? "model" : "user",
            parts: [{ text: textForModel }],
        };
    });

    // Fetch the base system instructions from the primary config doc
    let systemInstruction = "";
    try {
        const primaryDoc = DocumentApp.openById(CONFIG.SYSTEM_INSTRUCTION_DOC_ID);
        systemInstruction = primaryDoc.getBody().getText();
        console.log("Successfully fetched primary system instruction from document.");
    } catch (e: any) {
        console.error(`Failed to fetch primary system instruction doc ID ${CONFIG.SYSTEM_INSTRUCTION_DOC_ID}: ${e.message}`);
        throw new Error("Cannot proceed without primary system instructions.");
    }

    // Fetch context from Google Docs
    if (CONFIG.CONTEXT_DOC_IDS && CONFIG.CONTEXT_DOC_IDS.length > 0) {
        systemInstruction += "\n\n--- REFERENCE DOCUMENTATION ---\n";
        for (const docId of CONFIG.CONTEXT_DOC_IDS) {
            const doc = DocumentApp.openById(docId);
            const title = doc.getName();
            const text = doc.getBody().getText();
            systemInstruction += `\nDocument Title: ${title}\n${text}\n---\n`;
            console.log(`Successfully fetched context from document: ${title}`);
        }
    }

    const payload: VertexPayload = {
        contents: contents,
        systemInstruction: {
            parts: [{ text: systemInstruction }]
        },
        generationConfig: {
            temperature: 0.7,
        }
    };

    const url = `https://aiplatform.googleapis.com/v1/projects/${CONFIG.PROJECT_ID}/locations/${CONFIG.LOCATION}/publishers/google/models/${CONFIG.MODEL}:generateContent`;

    console.log(`Calling Vertex AI API at ${url}`);

    const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
        method: "post",
        contentType: "application/json",
        headers: {
            // Apps Script automatically fetches an OAuth token that covers the scopes listed in appsscript.json
            Authorization: `Bearer ${ScriptApp.getOAuthToken()}`,
        },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
    };

    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();

    if (responseCode !== 200) {
        console.error(`Vertex AI API Error (${responseCode}): ${responseText}`);
        throw new Error(`Failed to call Vertex AI API. Status: ${responseCode}`);
    }

    const json = JSON.parse(responseText);

    if (!json.candidates || json.candidates.length === 0) {
        console.error(`Vertex AI returned no candidates. Raw response: ${responseText}`);
        throw new Error("Vertex AI returned no candidates.");
    }

    const generatedText = json.candidates[0].content.parts[0].text;
    return generatedText;
}
