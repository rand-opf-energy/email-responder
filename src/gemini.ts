import { CONFIG } from "./config";
import { ParsedThread } from "./gmail";

// Interfaces for Vertex AI REST API payloads
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
 * @param botEmailAddress The email address of the bot to determine which messages were 'model' vs 'user'
 * @returns The generated response string from Gemini
 */
export function generateGeminiResponse(thread: ParsedThread, botEmailAddress: string): string {
    // Construct the conversation history for the Vertex API
    const contents: VertexContent[] = thread.messages.map((msg) => {
        const isBot = msg.sender.includes(botEmailAddress);

        // We prefix the text with the sender/date to give the model context about exactly who said what and when in the email metadata
        const contextualText = `[From: ${msg.sender} | Date: ${msg.date.toString()}]\n\n${msg.body}`;

        return {
            role: isBot ? "model" : "user",
            parts: [{ text: contextualText }],
        };
    });

    const payload: VertexPayload = {
        contents: contents,
        systemInstruction: {
            parts: [{ text: CONFIG.SYSTEM_INSTRUCTION }]
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
