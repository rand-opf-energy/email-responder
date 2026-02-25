import { getUnreadThreadsForAddress, markThreadAsRead } from "./gmail";
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

        // For the MVP, just mark it as read so we don't process it next minute.
        // Eventually, we will send this entire thread to Gemini here.
        markThreadAsRead(thread.threadId);
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
