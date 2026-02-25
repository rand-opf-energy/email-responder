/**
 * Fetches unread email threads sent to the specified address.
 * 
 * @param targetEmailAddress The email address the messages must have been sent to (e.g., 'reservations@sanmarinotennis.org')
 * @returns Array of ParsedThread objects containing the full conversation histories
 */
function getUnreadThreadsForAddress(targetEmailAddress, botEmailAddress) {
    // We search for unread threads where the target address is in the "to" or "cc" fields.
    const query = `is:unread (to:${targetEmailAddress} OR cc:${targetEmailAddress})`;
    console.log(`Searching Gmail for query: ${query}`);

    const threads = GmailApp.search(query);
    console.log(`Found ${threads.length} matching unread threads.`);

    const parsedThreads = [];

    for (const thread of threads) {
        const threadId = thread.getId();
        const subject = thread.getFirstMessageSubject();
        const messages = thread.getMessages();

        console.log(`Processing Thread ID: ${threadId} | Subject: "${subject}" | Messages: ${messages.length}`);

        const parsedMessages = messages.map((msg) => {
            // Prefer plain text body for AI processing
            let body = msg.getPlainBody();
            if (!body) {
                body = msg.getBody(); // fallback to HTML if no plain text
            }

            return {
                id: msg.getId(),
                sender: msg.getFrom(),
                recipient: msg.getTo(),
                subject: msg.getSubject(),
                date: msg.getDate(),
                body: body,
            };
        });

        // Check if the last message in the thread was sent by us to prevent infinite loops
        const lastMessage = parsedMessages[parsedMessages.length - 1];
        if (lastMessage.sender.includes(botEmailAddress)) {
            console.log(`Skipping Thread ID: ${threadId} because we were the last sender.`);
            continue;
        }

        // Add a max response count of 10 for the bot itself.
        // After 10 bot messages in the thread, we will simply STOP responding 
        // and ignore the thread so a human can take over.
        let botMessageCount = 0;
        for (let i = 0; i < parsedMessages.length; i++) {
            if (parsedMessages[i].sender.includes(botEmailAddress)) {
                botMessageCount++;
            }
        }

        if (botMessageCount >= 10) {
            console.log(`Skipping Thread ID: ${threadId} because the bot has already responded 10 times (needs human review).`);
            continue;
        }

        parsedThreads.push({
            threadId,
            subject,
            messages: parsedMessages
        });
    }

    return parsedThreads;
}

/**
 * Marks a specific thread as read so it is not processed again on the next tick.
 * 
 * @param threadId The ID of the thread to mark as read
 */
function markThreadAsRead(threadId) {
    const thread = GmailApp.getThreadById(threadId);
    if (thread) {
        thread.markRead();
        console.log(`Marked thread ${threadId} as read.`);
    } else {
        console.error(`Failed to find thread ${threadId} to mark as read.`);
    }
}
