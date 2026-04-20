import { CONFIG } from "./config";

/**
 * Data structure representing a single parsed email message.
 */
export interface ParsedEmail {
    id: string;
    sender: string;
    recipient: string;
    cc?: string;
    subject: string;
    date: GoogleAppsScript.Base.Date;
    body: string;
    messageIdHeader?: string;
}

/**
 * Data structure representing an entire email conversation history.
 */
export interface ParsedThread {
    threadId: string;
    subject: string;
    messages: ParsedEmail[];
    reachedMaxResponses?: boolean;
    needsCannedResponse?: boolean;
}

/**
 * Fetches and filters unread threads that the bot should process.
 * 
 * @returns Array of ParsedThread objects containing the full conversation histories
 */
export function getThreads(): ParsedThread[] {
    const unreadThreads = getUnreadThreads();
    return filterThreads(unreadThreads);
}

/**
 * Searches Gmail for unread threads that might be relevant to the bot.
 */
export function getUnreadThreads(): GoogleAppsScript.Gmail.GmailThread[] {
    const botEmailAddress = Session.getEffectiveUser().getEmail();
    // We search for unread threads where any valid target address OR the bot address is in the "to" or "cc" fields.
    const allTargets = [...CONFIG.VALID_TARGET_EMAILS, botEmailAddress];
    const targetConditions = allTargets.map(email => `to:${email} OR cc:${email}`).join(' OR ');
    const query = `is:unread (${targetConditions})`;
    console.log(`Searching Gmail for query: ${query}`);

    const threads = GmailApp.search(query);
    console.log(`Found ${threads.length} matching unread threads.`);
    return threads;
}

/**
 * Filters and parses the raw threads, applying ignore rules and checking for escalation or canned responses.
 */
export function filterThreads(threads: GoogleAppsScript.Gmail.GmailThread[]): ParsedThread[] {
    const botEmailAddress = Session.getEffectiveUser().getEmail();
    const parsedThreads: ParsedThread[] = [];

    for (const thread of threads) {
        const threadId = thread.getId();
        const subject = thread.getFirstMessageSubject();
        const messages = thread.getMessages();

        console.log(`Processing Thread ID: ${threadId} | Subject: "${subject}" | Messages: ${messages.length}`);

        const parsedMessages: ParsedEmail[] = parseGmailMessages(messages);

        // Add a max response count for the bot itself.
        // If it reaches MAX_BOT_RESPONSES, we flag it for escalation (to send the final message).
        let botMessageCount = 0;
        for (let i = 0; i < parsedMessages.length; i++) {
            if (parsedMessages[i].sender.includes(botEmailAddress)) {
                botMessageCount++;
            }
        }


        let reachedMaxResponses = false;
        if (botMessageCount >= CONFIG.MAX_BOT_RESPONSES) {
            console.log(`Thread ID: ${threadId} reached or exceeded ${CONFIG.MAX_BOT_RESPONSES} bot responses. Flagging for max responses message.`);
            reachedMaxResponses = true;
        }

        const lastMessage = parsedMessages[parsedMessages.length - 1];

        if (shouldIgnore(botEmailAddress, threadId, parsedMessages)) {
            thread.markRead();
            continue;
        }

        // If the thread is flagged for escalation, check if the last sender is already the bot
        // Wait, the above block already skips it if the bot was the last sender.
        // That means we only hit this line when the USER just sent the message that puts us *at* 
        // the max response count (or beyond it, e.g. if config changes).
        // Since reachedMaxResponses makes the main loop send the final message, we want to proceed.

        let needsCannedResponse = false;
        const combinedRecipients = (lastMessage.recipient + " " + (lastMessage.cc || "")).toLowerCase();
        const sentToValidTarget = CONFIG.VALID_TARGET_EMAILS.some(validEmail =>
            combinedRecipients.includes(validEmail.toLowerCase())
        );

        if (!sentToValidTarget) {
            console.log(`Thread ID: ${threadId} does not include a valid target email. Flagging for canned response.`);
            needsCannedResponse = true;
        }

        parsedThreads.push({
            threadId,
            subject,
            messages: parsedMessages,
            reachedMaxResponses,
            needsCannedResponse
        });
    }

    return parsedThreads;
}

/**
 * Marks a specific thread as read so it is not processed again on the next tick.
 * 
 * @param threadId The ID of the thread to mark as read
 */
export function markThreadAsRead(threadId: string): void {
    const thread = GmailApp.getThreadById(threadId);
    if (thread) {
        thread.markRead();
        console.log(`Marked thread ${threadId} as read.`);
    } else {
        console.error(`Failed to find thread ${threadId} to mark as read.`);
    }
}

/**
 * Extracts the raw email address from a formatted sender string.
 * Example: "John Doe <john@example.com>" -> "john@example.com"
 */
export function extractEmailAddress(senderInfo: string): string {
    const senderLower = senderInfo.toLowerCase();
    const emailMatch = senderLower.match(/<([^>]+)>|([^<>\s]+@[^<>\s]+)/);
    return emailMatch ? (emailMatch[1] || emailMatch[2] || senderLower) : senderLower;
}

/**
 * Parses raw Google Apps Script Gmail Messages into a standardized format for the AI.
 * Falls back to extracting HTML content if plain text is not available.
 * 
 * @param messages The raw messages retrieved from a Gmail thread
 * @returns Array of structured ParsedEmail objects
 */
export function parseGmailMessages(messages: GoogleAppsScript.Gmail.GmailMessage[]): ParsedEmail[] {
    return messages.map((msg) => {
        // Prefer plain text body for AI processing as it contains less token-heavy markup
        let body = msg.getPlainBody();
        if (!body) {
            body = msg.getBody(); // fallback to HTML if no plain text available
        }

        return {
            id: msg.getId(),
            sender: msg.getFrom(),
            recipient: msg.getTo(),
            cc: typeof msg.getCc === 'function' ? msg.getCc() : "",
            subject: msg.getSubject(),
            date: msg.getDate(),
            body: body,
            messageIdHeader: msg.getHeader("Message-ID"),
        };
    });
}

/**
 * Checks if a given thread should be skipped based on its properties and last message.
 * Rules are evaluated in precedence order:
 * 1. Has the bot already been the last sender? (prevent infinite loops)
 * 2. Does the last message involve the escalation address?
 * 3. Have any non-bot staff members responded?
 * 4. Is the sender on the explicit ignored senders/domains denylist?
 * 
 * @param botEmailAddress The bot's own email address
 * @param threadId The thread's unique ID for logging
 * @param parsedMessages All messages in the thread history
 * @returns true if the email responder should not process this thread
 */
function shouldIgnore(botEmailAddress: string, threadId: string, parsedMessages: ParsedEmail[]): boolean {
    const lastMessage = parsedMessages[parsedMessages.length - 1];

    // 1. Check if the last message in the thread was sent by us to prevent infinite loops
    if (lastMessage.sender.includes(botEmailAddress)) {
        console.log(`Skipping Thread ID: ${threadId} because we were the last sender.`);
        return true;
    }

    // 2. Do not process if the last message involves the escalation email address
    let involvesEscalationEmail = false;
    if (CONFIG.ENABLE_ESCALATIONS && CONFIG.ESCALATION_EMAIL) {
        involvesEscalationEmail = Boolean(
            lastMessage.recipient.toLowerCase().includes(CONFIG.ESCALATION_EMAIL.toLowerCase()) ||
            (lastMessage.cc && lastMessage.cc.toLowerCase().includes(CONFIG.ESCALATION_EMAIL.toLowerCase()))
        );
    }

    if (involvesEscalationEmail) {
        console.log(`Skipping Thread ID: ${threadId} because the last message involves the escalation email (${CONFIG.ESCALATION_EMAIL}).`);
        return true;
    }

    // 3. Check if any staff member (@opf.energy) has responded in the thread.
    // We exclude the bot's own email address to allow the bot to respond.
    const staffResponded = parsedMessages.some(msg => {
        const email = extractEmailAddress(msg.sender);
        return email.endsWith('@opf.energy') && email !== botEmailAddress.toLowerCase();
    });

    if (staffResponded) {
        console.log(`Skipping Thread ID: ${threadId} because a staff member (@opf.energy) has already responded.`);
        return true;
    }

    const senderEmail = extractEmailAddress(lastMessage.sender);

    // 4. Check if the sender is on the ignored senders or ignored domains denylists
    const isIgnoredSender = CONFIG.IGNORED_SENDERS.some(ignored => senderEmail === ignored.toLowerCase());

    // Check if the last sender's domain is in the ignored domains list
    const senderDomain = senderEmail.split('@')[1] || "";

    const isIgnoredDomain = CONFIG.IGNORED_DOMAINS.some(domain => senderDomain === domain.toLowerCase());

    if (isIgnoredSender || isIgnoredDomain) {
        console.log(`Skipping Thread ID: ${threadId} because the sender (${lastMessage.sender}) is on the IGNORED_SENDERS or IGNORED_DOMAINS list.`);
        return true;
    }

    return false;
}
