// @ts-nocheck - Required because we stripped the exports from the main file for Apps Script natively
const fs = require('fs');
const path = require('path');

// Dynamically evaluate the JS file into the current test context since we removed the exports
const code = fs.readFileSync(path.join(__dirname, '../src/gmail.ts'), 'utf8');
eval(code);

describe('gmail.ts unread thread fetching', () => {
    let mockSearch: any;

    beforeEach(() => {
        // Reset the global mock before each test
        mockSearch = jest.spyOn(global.GmailApp, 'search');
        mockSearch.mockClear();
    });

    it('should ignore threads where the bot was the last sender (infinite loop guard)', () => {
        mockSearch.mockReturnValue([
            {
                getId: () => 'thread_1',
                getFirstMessageSubject: () => 'Test Subject',
                getMessages: () => [
                    {
                        getId: () => 'msg_1',
                        getFrom: () => 'user@example.com',
                        getTo: () => 'reservations@sanmarinotennis.org',
                        getSubject: () => 'Test Subject',
                        getDate: () => new Date(),
                        getPlainBody: () => 'Hello',
                        getBody: () => 'Hello',
                    },
                    {
                        getId: () => 'msg_2',
                        getFrom: () => 'skye@sanmarinotennis.org', // Bot is the last sender
                        getTo: () => 'user@example.com',
                        getSubject: () => 'Re: Test Subject',
                        getDate: () => new Date(),
                        getPlainBody: () => 'We have received your message',
                        getBody: () => 'We have received your message',
                    },
                ],
            },
        ]);

        const result = getUnreadThreadsForAddress('reservations@sanmarinotennis.org', 'skye@sanmarinotennis.org');

        expect(mockSearch).toHaveBeenCalled();
        // The thread should be skipped entirely
        expect(result.length).toBe(0);
    });

    it('should process threads where the user was the last sender', () => {
        mockSearch.mockReturnValue([
            {
                getId: () => 'thread_1',
                getFirstMessageSubject: () => 'Test Subject',
                getMessages: () => [
                    {
                        getId: () => 'msg_1',
                        getFrom: () => 'skye@sanmarinotennis.org', // Bot started the thread
                        getTo: () => 'user@example.com',
                        getSubject: () => 'Test Subject',
                        getDate: () => new Date(),
                        getPlainBody: () => 'Hello',
                        getBody: () => 'Hello',
                    },
                    {
                        getId: () => 'msg_2',
                        getFrom: () => 'user@example.com', // User replied recently
                        getTo: () => 'reservations@sanmarinotennis.org',
                        getSubject: () => 'Re: Test Subject',
                        getDate: () => new Date(),
                        getPlainBody: () => 'Thank you',
                        getBody: () => 'Thank you',
                    },
                ],
            },
        ]);

        const result = getUnreadThreadsForAddress('reservations@sanmarinotennis.org', 'skye@sanmarinotennis.org');

        expect(mockSearch).toHaveBeenCalled();
        // The thread should be parsed and returned
        expect(result.length).toBe(1);
        expect(result[0].threadId).toBe('thread_1');
        expect(result[0].messages.length).toBe(2);
    });

    it('should ignore threads where the bot has already replied 10 times', () => {
        // Generate 10 bot replies and 11 user messages
        const mockMessages = Array.from({ length: 21 }, (_, i) => ({
            getId: () => `msg_${i}`,
            getFrom: () => (i % 2 === 0 ? 'user@example.com' : 'skye@sanmarinotennis.org'),
            getTo: () => 'reservations@sanmarinotennis.org',
            getSubject: () => 'Long Thread',
            getDate: () => new Date(),
            getPlainBody: () => `Message ${i}`,
            getBody: () => `Message ${i}`,
        }));

        // Ensure the very last message is from the user so it doesn't get skipped by the infinite loop guard
        mockMessages[20].getFrom = () => 'user@example.com';

        mockSearch.mockReturnValue([
            {
                getId: () => 'thread_long',
                getFirstMessageSubject: () => 'Long Thread',
                getMessages: () => mockMessages,
            },
        ]);

        const result = getUnreadThreadsForAddress('reservations@sanmarinotennis.org', 'skye@sanmarinotennis.org');

        expect(mockSearch).toHaveBeenCalled();
        // Thread must be skipped due to exceeding max bot response count
        expect(result.length).toBe(0);
    });

    it('should process threads where the bot has replied 9 times', () => {
        // Generate 9 bot replies and 10 user messages
        const mockMessages = Array.from({ length: 19 }, (_, i) => ({
            getId: () => `msg_${i}`,
            getFrom: () => (i % 2 === 0 ? 'user@example.com' : 'skye@sanmarinotennis.org'),
            getTo: () => 'reservations@sanmarinotennis.org',
            getSubject: () => 'Long Thread',
            getDate: () => new Date(),
            getPlainBody: () => `Message ${i}`,
            getBody: () => `Message ${i}`,
        }));

        // Ensure the very last message is from the user
        mockMessages[18].getFrom = () => 'user@example.com';

        mockSearch.mockReturnValue([
            {
                getId: () => 'thread_almost_long',
                getFirstMessageSubject: () => 'Long Thread',
                getMessages: () => mockMessages,
            },
        ]);

        const result = getUnreadThreadsForAddress('reservations@sanmarinotennis.org', 'skye@sanmarinotennis.org');

        expect(mockSearch).toHaveBeenCalled();
        expect(result.length).toBe(1);
        expect(result[0].messages.length).toBe(19);
    });
});
