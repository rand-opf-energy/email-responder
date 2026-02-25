import { getUnreadThreadsForAddress, markThreadAsRead } from "./gmail";
import { generateGeminiResponse } from "./gemini";

const TARGET_EMAIL_ADDRESS = "reservations@sanmarinotennis.org";
const BOT_EMAIL_ADDRESS = "skye@sanmarinotennis.org";

/**
 * Global entry point executed every minute by the time-driven trigger.
 */
function processEmailsTick() {
    console.log(`--- Email Tick Started at ${new Date().toISOString()} ---`);

    const unreadThreads = getUnreadThreadsForAddress(TARGET_EMAIL_ADDRESS, BOT_EMAIL_ADDRESS);

    if (unreadThreads.length === 0) {
        console.log("No new unread emails found.");
        return;
    }

    for (const thread of unreadThreads) {
        console.log(`\n================================`);
        console.log(`=== NEW THREAD: ${thread.subject} ===`);
        console.log(`================================`);

        // Print each message in the thread history
        for (const [index, msg] of thread.messages.entries()) {
            console.log(`\n--- Message ${index + 1} ---`);
            console.log(`From:    ${msg.sender}`);
            console.log(`To:      ${msg.recipient}`);
            console.log(`Date:    ${msg.date.toISOString()}`);
            console.log(`Body:\n${msg.body}`);
        }

        try {
            console.log("Generating response from Vertex AI...");
            const aiResponse = generateGeminiResponse(thread, BOT_EMAIL_ADDRESS);

            console.log(`\n================================`);
            console.log(`=== AI RESPONSE ===`);
            console.log(`================================`);
            console.log(aiResponse);

            // We use the Thread's underlying GmailApp object to append the reply to the current email chain
            const nativeThread = GmailApp.getThreadById(thread.threadId);
            if (nativeThread) {
                console.log("Sending reply via Gmail API (reply-only, not reply-all)...");
                const disclaimer = "⚠️ [INTERNAL TESTING] This is an automated response from the email responder bot. Do NOT forward or send this outside the team yet. ⚠️\n\n";
                nativeThread.reply(disclaimer + aiResponse);

                // Immediately mark as read to avoid the 1-minute trigger picking it up again
                markThreadAsRead(thread.threadId);
            }
        } catch (e: any) {
            console.error(`Error processing thread ${thread.threadId}: ${e.message}`);
            // Do NOT mark as read if it failed, so we can retry on the next tick
        }
    }

    console.log(`\n--- Email Tick Finished ---`);
}

/**
 * One-time setup function to install the time-driven trigger.
 * Run this ONCE manually from the Apps Script UI to start the bot.
 */
function installTrigger() {
    const functionName = "processEmailsTick";

    // Clean up any existing triggers to prevent duplicates
    const triggers = ScriptApp.getProjectTriggers();
    for (const trigger of triggers) {
        if (trigger.getHandlerFunction() === functionName) {
            ScriptApp.deleteTrigger(trigger);
        }
    }

    // Create a new trigger to run every 1 minute
    ScriptApp.newTrigger(functionName)
        .timeBased()
        .everyMinutes(1)
        .create();

    console.log(`Successfully installed trigger for ${functionName} to run every minute.`);
}

// Expose these wrapper functions to the global Apps Script scope since esbuild will bundle them
(globalThis as any).processEmailsTick = processEmailsTick;
(globalThis as any).installTrigger = installTrigger;
