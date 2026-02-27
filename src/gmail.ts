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
    isEscalated?: boolean;
}

/**
 * Fetches unread email threads sent to the specified address.
 * 
 * @param targetEmailAddress The email address the messages must have been sent to (e.g., 'reservations@sanmarinotennis.org')
 * @returns Array of ParsedThread objects containing the full conversation histories
 */
export function getUnreadThreadsForAddress(targetEmailAddress: string, botEmailAddress: string): ParsedThread[] {
    // We search for unread threads where the target address is in the "to" or "cc" fields.
    const query = `is:unread (to:${targetEmailAddress} OR cc:${targetEmailAddress})`;
    console.log(`Searching Gmail for query: ${query}`);

    const threads = GmailApp.search(query);
    console.log(`Found ${threads.length} matching unread threads.`);

    const parsedThreads: ParsedThread[] = [];

    for (const thread of threads) {
        const threadId = thread.getId();
        const subject = thread.getFirstMessageSubject();
        const messages = thread.getMessages();

        console.log(`Processing Thread ID: ${threadId} | Subject: "${subject}" | Messages: ${messages.length}`);

        const parsedMessages: ParsedEmail[] = messages.map((msg) => {
            // Prefer plain text body for AI processing
            let body = msg.getPlainBody();
            if (!body) {
                body = msg.getBody(); // fallback to HTML if no plain text
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

        // Add a max response count for the bot itself.
        // If it reaches MAX_BOT_RESPONSES, we flag it for escalation (to send the final message).
        let botMessageCount = 0;
        for (let i = 0; i < parsedMessages.length; i++) {
            if (parsedMessages[i].sender.includes(botEmailAddress)) {
                botMessageCount++;
            }
        }

        let isEscalated = false;
        if (botMessageCount >= CONFIG.MAX_BOT_RESPONSES) {
            console.log(`Thread ID: ${threadId} reached or exceeded ${CONFIG.MAX_BOT_RESPONSES} bot responses. Flagging for escalation.`);
            isEscalated = true;
        }

        // Check if the last message in the thread was sent by us to prevent infinite loops
        const lastMessage = parsedMessages[parsedMessages.length - 1];
        if (lastMessage.sender.includes(botEmailAddress)) {
            console.log(`Skipping Thread ID: ${threadId} because we were the last sender.`);
            thread.markRead(); // Mark as read since the inbox is solely for the bot
            continue;
        }

        if (shouldIgnore(lastMessage, botEmailAddress, threadId)) {
            thread.markRead();
            continue;
        }

        // If the thread is flagged for escalation, check if the last sender is already the bot
        // Wait, the above block already skips it if the bot was the last sender.
        // That means we only hit this line when the USER just sent the message that puts us *at* 
        // the max response count (or beyond it, e.g. if config changes).
        // Since isEscalated makes the main loop send the final message, we want to proceed.

        parsedThreads.push({
            threadId,
            subject,
            messages: parsedMessages,
            isEscalated
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
 * Checks if the thread should be ignored based on the last message sent.
 */
function shouldIgnore(lastMessage: ParsedEmail, botEmailAddress: string, threadId: string): boolean {
    const involvesEscalationEmail =
        lastMessage.recipient.toLowerCase().includes(CONFIG.ESCALATION_EMAIL.toLowerCase()) ||
        (lastMessage.cc && lastMessage.cc.toLowerCase().includes(CONFIG.ESCALATION_EMAIL.toLowerCase()));

    if (involvesEscalationEmail) {
        console.log(`Skipping Thread ID: ${threadId} because the last message involves the escalation email (${CONFIG.ESCALATION_EMAIL}).`);
        return true;
    }

    let isAllowed = true;
    if (CONFIG.ALLOWED_SENDERS && CONFIG.ALLOWED_SENDERS.length > 0) {
        isAllowed = CONFIG.ALLOWED_SENDERS.some(allowed => lastMessage.sender.toLowerCase().includes(allowed.toLowerCase()));
    }

    if (!isAllowed) {
        console.log(`Skipping Thread ID: ${threadId} because the sender (${lastMessage.sender}) is not on the ALLOWED_SENDERS list.`);
        return true;
    }

    // Check if the last sender is in the ignored senders list
    const isIgnoredSender = CONFIG.IGNORED_SENDERS.some(ignored => lastMessage.sender.toLowerCase().includes(ignored.toLowerCase()));

    // Check if the last sender's domain is in the ignored domains list
    const senderLower = lastMessage.sender.toLowerCase();
    // Extract domain from sender, which could be formatted like "Name <email@domain.com>" or just "email@domain.com"
    const emailMatch = senderLower.match(/<([^>]+)>|([^<>\s]+@[^<>\s]+)/);
    const emailAddress = emailMatch ? (emailMatch[1] || emailMatch[2] || senderLower) : senderLower;
    const senderDomain = emailAddress.split('@')[1] || "";

    const isIgnoredDomain = CONFIG.IGNORED_DOMAINS.some(domain => senderDomain === domain.toLowerCase());

    if (isIgnoredSender || isIgnoredDomain) {
        console.log(`Skipping Thread ID: ${threadId} because the sender (${lastMessage.sender}) is on the IGNORED_SENDERS or IGNORED_DOMAINS list.`);
        return true;
    }

    return false;
}
