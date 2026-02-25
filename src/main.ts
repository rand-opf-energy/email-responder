/**
 * Global entry point executed every minute by the time-driven trigger.
 */
function processEmailsTick() {
    console.log("Tick: processEmailsTicked called at", new Date().toISOString());
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
