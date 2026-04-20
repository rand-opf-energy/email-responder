import { getThreads, markThreadAsRead } from "./gmail";
import { generateGeminiResponse } from "./gemini";
import { CONFIG } from "./config";
/**
 * Global entry point executed every minute by the time-driven trigger.
 * This reads unread threads, routes them to Vertex AI, and replies to them.
 */
function processEmailsTick() {
    console.log(`--- Email Tick Started at ${new Date().toISOString()} ---`);

    const unreadThreads = getThreads();

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
            let aiResponse = "";

            if (thread.needsCannedResponse) {
                console.log("Thread is a direct message. Skipping Vertex AI and sending canned response...");
                aiResponse = CONFIG.CANNED_DIRECT_MESSAGE;
            } else if (thread.reachedMaxResponses) {
                console.log("Thread has reached max responses. Skipping Vertex AI...");
                aiResponse = CONFIG.MAX_RESPONSES_MESSAGE;
            } else {
                console.log("Generating response from Vertex AI...");
                aiResponse = generateGeminiResponse(thread);
            }

            console.log(`\n================================`);
            console.log(`=== AI RESPONSE ===`);
            console.log(`================================`);
            console.log(aiResponse);

            const bodyContent = thread.reachedMaxResponses ? aiResponse : `${aiResponse}\n\n${CONFIG.SIGNATURE}`;
            const htmlBodyContent = bodyContent.replace(/\r?\n/g, "<br>");

            try {
                const gmailThread = GmailApp.getThreadById(thread.threadId);
                if (gmailThread) {
                    const options: GoogleAppsScript.Gmail.GmailAdvancedOptions = {
                        htmlBody: htmlBodyContent
                    };
                    if (CONFIG.ENABLE_ESCALATIONS && thread.reachedMaxResponses && CONFIG.ESCALATION_EMAIL) {
                        options.bcc = CONFIG.ESCALATION_EMAIL;
                    }

                    gmailThread.replyAll(bodyContent, options);
                    console.log("Reply sent successfully via replyAll.");
                } else {
                    console.error("Failed to retrieve the Gmail thread to reply to.");
                }
            } catch (innerErr: any) {
                console.error("Failed to send reply:", innerErr);
                // Re-throw to be caught by the outer catch.
                // This prevents marking the thread as read if the reply failed, 
                // allowing it to be retried on the next tick.
                throw innerErr;
            }

            // Mark as read to avoid the 1-minute trigger picking it up again
            markThreadAsRead(thread.threadId);
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
