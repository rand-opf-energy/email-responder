export const CONFIG = {
    // GCP Project ID for Vertex AI
    PROJECT_ID: "opf-energy",

    // Vertex AI Region
    LOCATION: "global",

    // Gemini model version to use
    MODEL: "gemini-3.1-pro-preview",

    // Google Doc ID containing the system instructions (the bot's "persona" and rules)
    SYSTEM_INSTRUCTION_DOC_ID: "1ph_0Eujc5wNEViwb0UyWP6JOVvWiE8M4KIlIvVexv2k",

    // Array of Google Doc IDs containing context/reference information for the AI (e.g. schedules)
    CONTEXT_DOC_IDS: [
        "1fGHnNLqIfP7SwvcR7oW6p-WIVshe9rCi4Aqp4gH01zM",
        "1PCFW_I3aKNluD6PNn2Zd9KXal-vKdAwZWM8_jhmImHA",
        "1QA4YoQVxshtM5qtN0Fyg0lmGcxb-7rgA-kS94ldePjQ"
    ],

    // The addresses that the bot monitors and acts on behalf of
    VALID_TARGET_EMAILS: [
        "help@opf.energy"
    ],

    // The canned response sent when an email is sent directly to the bot's address
    CANNED_DIRECT_MESSAGE: "Hi there! It looks like you emailed me directly. Please make sure to email help@opf.energy instead for assistance!",

    // List of email addresses that the bot should completely ignore and never reply to
    IGNORED_SENDERS: [] as string[],

    // List of domains that the bot should completely ignore and never reply to
    IGNORED_DOMAINS: [
        "opf.energy",
        "courtreserve.com",
        "safesavepayments.com"
    ],

    // The signature/disclaimer to append to the end of every AI-generated email
    SIGNATURE: `
---
This message was fetched by Skye, the SMTC AI-powered mascot.
For immediate assistance or if this response was unhelpful, please reply to help+escalated@opf.energy and a human staff member will assist you shortly.
    `.trim(),

    // Escalation settings
    ESCALATION_EMAIL: "help+escalated@opf.energy",
    ESCALATION_MESSAGE: "This thread has reached the maximum number of automated responses and requires human review.",
    MAX_BOT_RESPONSES: 10,
};
