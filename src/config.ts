export const CONFIG = {
    // GCP Project ID for Vertex AI
    PROJECT_ID: "opf-energy",

    // Vertex AI Region
    LOCATION: "global",

    // Gemini model version to use
    MODEL: "gemini-3.1-pro-preview",

    // Google Doc ID containing the system instructions (the bot's "persona" and rules)
    SYSTEM_INSTRUCTION_DOC_ID: "1sLXkX7hxgrt8qxorh0kHYsRd4vwb2ut6hpfaGRSjocs",

    // Array of Google Doc IDs containing context/reference information for the AI (e.g. schedules)
    CONTEXT_DOC_IDS: [],

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
        "opf.energy"
    ],

    // The signature/disclaimer to append to the end of every AI-generated email
    SIGNATURE: `
---
This message was fetched by Opti, the OPF Energy AI-powered assistant.
    `.trim(),

    // Escalation settings
    ENABLE_ESCALATIONS: false, // Set to true to enable escalation logic
    ESCALATION_EMAIL: "", // TODO: Setup escalation infra and add email here
    MAX_RESPONSES_MESSAGE: "This thread has reached the maximum number of automated responses and requires human review.",
    MAX_BOT_RESPONSES: 10,
};
