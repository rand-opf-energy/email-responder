import { getUnreadThreads, extractEmailAddress } from '../src/gmail';
import { CONFIG } from '../src/config';

describe('gmail.ts unread thread fetching', () => {
    describe('extractEmailAddress', () => {
        it('should extract email from angle brackets', () => {
            expect(extractEmailAddress('John Doe <john@example.com>')).toBe('john@example.com');
        });

        it('should return the email if no angle brackets are present', () => {
            expect(extractEmailAddress('john@example.com')).toBe('john@example.com');
        });

        it('should convert email to lowercase', () => {
            expect(extractEmailAddress('John Doe <JOHN@EXAMPLE.COM>')).toBe('john@example.com');
        });
    });

    let mockSearch: any;
    let originalAllowedSenders: string[] | undefined;

    beforeEach(() => {
        // Reset the global mock before each test
        mockSearch = jest.spyOn(global.GmailApp, 'search');
        mockSearch.mockClear();
        originalAllowedSenders = CONFIG.ALLOWED_SENDERS ? [...CONFIG.ALLOWED_SENDERS] : undefined;
        CONFIG.ALLOWED_SENDERS = ['user@example.com'];
    });

    afterEach(() => {
        if (originalAllowedSenders !== undefined) {
            CONFIG.ALLOWED_SENDERS = originalAllowedSenders;
        } else {
            // Revert it
            CONFIG.ALLOWED_SENDERS = [];
        }
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
                        getHeader: (name: string) => name === 'Message-ID' ? 'mock-id' : null,
                    },
                    {
                        getId: () => 'msg_2',
                        getFrom: () => 'skye@sanmarinotennis.org', // Bot is the last sender
                        getTo: () => 'user@example.com',
                        getSubject: () => 'Re: Test Subject',
                        getDate: () => new Date(),
                        getPlainBody: () => 'We have received your message',
                        getBody: () => 'We have received your message',
                        getHeader: (name: string) => name === 'Message-ID' ? 'mock-id' : null,
                    },
                ],
                markRead: jest.fn(),
            },
        ]);

        const result = getUnreadThreads('skye@sanmarinotennis.org');

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
                        getHeader: (name: string) => name === 'Message-ID' ? 'mock-id' : null,
                    },
                    {
                        getId: () => 'msg_2',
                        getFrom: () => 'user@example.com', // User replied recently
                        getTo: () => 'reservations@sanmarinotennis.org',
                        getSubject: () => 'Re: Test Subject',
                        getDate: () => new Date(),
                        getPlainBody: () => 'Thank you',
                        getBody: () => 'Thank you',
                        getHeader: (name: string) => name === 'Message-ID' ? 'mock-id' : null,
                    },
                ],
                markRead: jest.fn(),
            },
        ]);

        const result = getUnreadThreads('skye@sanmarinotennis.org');

        expect(mockSearch).toHaveBeenCalled();
        // The thread should be parsed and returned
        expect(result.length).toBe(1);
        expect(result[0].threadId).toBe('thread_1');
        expect(result[0].messages.length).toBe(2);
        expect(result[0].isEscalated).toBe(false);
    });

    it('should skip but not flag threads where the bot has replied >10 times', () => {
        // Generate 11 bot replies and 12 user messages
        const mockMessages = Array.from({ length: 23 }, (_, i) => ({
            getId: () => `msg_${i}`,
            getFrom: () => (i % 2 === 0 ? 'user@example.com' : 'skye@sanmarinotennis.org'),
            getTo: () => 'reservations@sanmarinotennis.org',
            getSubject: () => 'Long Thread',
            getDate: () => new Date(),
            getPlainBody: () => `Message ${i}`,
            getBody: () => `Message ${i}`,
            getHeader: (name: string) => name === 'Message-ID' ? 'mock-id' : null,
        }));

        // Ensure the very last message is from the user so it doesn't get skipped by the infinite loop guard
        mockMessages[22].getFrom = () => 'user@example.com';

        mockSearch.mockReturnValue([
            {
                getId: () => 'thread_long',
                getFirstMessageSubject: () => 'Long Thread',
                getMessages: () => mockMessages,
                markRead: jest.fn(),
            },
        ]);

        const result = getUnreadThreads('skye@sanmarinotennis.org');

        expect(mockSearch).toHaveBeenCalled();
        // Since we removed the "exceeds MAX_BOT_RESPONSES, simply STOP responding" 
        // logic, it now *always* flags for escalation instead.
        expect(result.length).toBe(1);
        expect(result[0].messages.length).toBe(23);
        expect(result[0].isEscalated).toBe(true);
    });

    it('should return and flag threads where the bot has replied exactly 10 times', () => {
        // Generate 10 bot replies and 11 user messages
        const mockMessages = Array.from({ length: 21 }, (_, i) => ({
            getId: () => `msg_${i}`,
            getFrom: () => (i % 2 === 0 ? 'user@example.com' : 'skye@sanmarinotennis.org'),
            getTo: () => 'reservations@sanmarinotennis.org',
            getSubject: () => 'Long Thread',
            getDate: () => new Date(),
            getPlainBody: () => `Message ${i}`,
            getBody: () => `Message ${i}`,
            getHeader: (name: string) => name === 'Message-ID' ? 'mock-id' : null,
        }));

        // Ensure the very last message is from the user
        mockMessages[20].getFrom = () => 'user@example.com';

        mockSearch.mockReturnValue([
            {
                getId: () => 'thread_escalate',
                getFirstMessageSubject: () => 'Long Thread',
                getMessages: () => mockMessages,
                markRead: jest.fn(),
            },
        ]);

        const result = getUnreadThreads('skye@sanmarinotennis.org');

        expect(mockSearch).toHaveBeenCalled();
        expect(result.length).toBe(1);
        expect(result[0].messages.length).toBe(21);
        expect(result[0].isEscalated).toBe(true);
    });

    it('should skip and mark read threads from ignored senders', () => {
        const mockThread = {
            getId: () => 'thread_ignored',
            getFirstMessageSubject: () => 'Notification',
            getMessages: () => [
                {
                    getId: () => 'msg_1',
                    getFrom: () => 'notifications@courtreserve.com',
                    getTo: () => 'reservations@sanmarinotennis.org',
                    getSubject: () => 'Notification',
                    getDate: () => new Date(),
                    getPlainBody: () => 'Sys alert',
                    getBody: () => 'Sys alert',
                    getHeader: (name: string) => name === 'Message-ID' ? 'mock-id' : null,
                }
            ],
            markRead: jest.fn(),
        };

        mockSearch.mockReturnValue([mockThread]);

        const result = getUnreadThreads('skye@sanmarinotennis.org');

        expect(result.length).toBe(0);
        expect(mockThread.markRead).toHaveBeenCalled();
    });

    it('should skip and mark read threads from ignored domains', () => {
        const mockThread = {
            getId: () => 'thread_domain',
            getFirstMessageSubject: () => 'Internal memo',
            getMessages: () => [
                {
                    getId: () => 'msg_1',
                    getFrom: () => 'Staff Member <staff@sanmarinotennis.org>',
                    getTo: () => 'reservations@sanmarinotennis.org',
                    getSubject: () => 'Internal memo',
                    getDate: () => new Date(),
                    getPlainBody: () => 'Alert',
                    getBody: () => 'Alert',
                    getHeader: (name: string) => name === 'Message-ID' ? 'mock-id' : null,
                }
            ],
            markRead: jest.fn(),
        };

        mockSearch.mockReturnValue([mockThread]);

        const result = getUnreadThreads('skye@sanmarinotennis.org');

        expect(result.length).toBe(0);
        expect(mockThread.markRead).toHaveBeenCalled();
    });

    it('should skip and mark read threads from not allowed senders', () => {
        CONFIG.ALLOWED_SENDERS = ['someotheruser@example.com'];
        const mockThread = {
            getId: () => 'thread_not_allowed',
            getFirstMessageSubject: () => 'Not Allowed',
            getMessages: () => [
                {
                    getId: () => 'msg_1',
                    getFrom: () => 'user@example.com',
                    getTo: () => 'reservations@sanmarinotennis.org',
                    getSubject: () => 'Not Allowed',
                    getDate: () => new Date(),
                    getPlainBody: () => 'Hello',
                    getBody: () => 'Hello',
                    getHeader: (name: string) => name === 'Message-ID' ? 'mock-id' : null,
                }
            ],
            markRead: jest.fn(),
        };

        mockSearch.mockReturnValue([mockThread]);

        const result = getUnreadThreads('skye@sanmarinotennis.org');

        expect(result.length).toBe(0);
        expect(mockThread.markRead).toHaveBeenCalled();
    });

    it('should NOT process threads from senders that are substrings of allowed senders', () => {
        CONFIG.ALLOWED_SENDERS = ['user@example.com'];
        const mockThread = {
            getId: () => 'thread_substring',
            getFirstMessageSubject: () => 'Substring Test',
            getMessages: () => [
                {
                    getId: () => 'msg_1',
                    getFrom: () => 'test_user@example.com', // Contains 'user@example.com' but is not exactly equal
                    getTo: () => 'reservations@sanmarinotennis.org',
                    getSubject: () => 'Substring Test',
                    getDate: () => new Date(),
                    getPlainBody: () => 'Testing substring match',
                    getBody: () => 'Testing substring match',
                    getHeader: (name: string) => name === 'Message-ID' ? 'mock-id' : null,
                }
            ],
            markRead: jest.fn(),
        };

        mockSearch.mockReturnValue([mockThread]);

        const result = getUnreadThreads('skye@sanmarinotennis.org');

        expect(result.length).toBe(0);
        expect(mockThread.markRead).toHaveBeenCalled();
    });

    it('should skip and mark read threads if the last message involves the escalation email', () => {
        CONFIG.ALLOWED_SENDERS = ['user@example.com'];
        CONFIG.ESCALATION_EMAIL = 'reservations+escalated@sanmarinotennis.org';
        const mockThread = {
            getId: () => 'thread_escalated',
            getFirstMessageSubject: () => 'Help me',
            getMessages: () => [
                {
                    getId: () => 'msg_1',
                    getFrom: () => 'user@example.com',
                    getTo: () => 'reservations@sanmarinotennis.org',
                    getSubject: () => 'Help me',
                    getDate: () => new Date(),
                    getPlainBody: () => 'I need human help',
                    getBody: () => 'I need human help',
                    getHeader: (name: string) => name === 'Message-ID' ? 'mock-id' : null,
                },
                {
                    getId: () => 'msg_2',
                    getFrom: () => 'user@example.com',
                    getTo: () => 'reservations@sanmarinotennis.org, reservations+escalated@sanmarinotennis.org',
                    getSubject: () => 'Re: Help me',
                    getDate: () => new Date(),
                    getPlainBody: () => 'Forwarding to escalated',
                    getBody: () => 'Forwarding to escalated',
                    getHeader: (name: string) => name === 'Message-ID' ? 'mock-id' : null,
                }
            ],
            markRead: jest.fn(),
        };

        mockSearch.mockReturnValue([mockThread]);

        const result = getUnreadThreads('skye@sanmarinotennis.org');

        expect(result.length).toBe(0);
        expect(mockThread.markRead).toHaveBeenCalled();
    });

    it('should NOT skip threads if an earlier message involved the escalation email but the latest does not', () => {
        CONFIG.ALLOWED_SENDERS = ['user@example.com'];
        CONFIG.ESCALATION_EMAIL = 'reservations+escalated@sanmarinotennis.org';
        const mockThread = {
            getId: () => 'thread_escalate_removed',
            getFirstMessageSubject: () => 'Help me',
            getMessages: () => [
                {
                    getId: () => 'msg_1',
                    getFrom: () => 'user@example.com',
                    getTo: () => 'reservations@sanmarinotennis.org, reservations+escalated@sanmarinotennis.org',
                    getSubject: () => 'Help me',
                    getDate: () => new Date(),
                    getPlainBody: () => 'I need human help',
                    getBody: () => 'I need human help',
                    getHeader: (name: string) => name === 'Message-ID' ? 'mock-id' : null,
                },
                {
                    getId: () => 'msg_2',
                    getFrom: () => 'user@example.com',
                    getTo: () => 'reservations@sanmarinotennis.org',
                    getSubject: () => 'Re: Help me',
                    getDate: () => new Date(),
                    getPlainBody: () => 'Continuing thread',
                    getBody: () => 'Continuing thread',
                    getHeader: (name: string) => name === 'Message-ID' ? 'mock-id' : null,
                }
            ],
            markRead: jest.fn(),
        };

        mockSearch.mockReturnValue([mockThread]);

        const result = getUnreadThreads('skye@sanmarinotennis.org');

        expect(result.length).toBe(1);
        expect(mockThread.markRead).not.toHaveBeenCalled();
    });

    it('should flag threads sent directly to the bot with needsCannedResponse = true', () => {
        CONFIG.ALLOWED_SENDERS = ['user@example.com'];
        CONFIG.VALID_TARGET_EMAILS = ['reservations@sanmarinotennis.org'];
        const mockThread = {
            getId: () => 'thread_direct',
            getFirstMessageSubject: () => 'Hello Bot',
            getMessages: () => [
                {
                    getId: () => 'msg_1',
                    getFrom: () => 'user@example.com',
                    getTo: () => 'skye@sanmarinotennis.org',
                    getSubject: () => 'Hello Bot',
                    getDate: () => new Date(),
                    getPlainBody: () => 'Hello there',
                    getBody: () => 'Hello there',
                    getHeader: (name: string) => name === 'Message-ID' ? 'mock-id' : null,
                }
            ],
            markRead: jest.fn(),
        };

        mockSearch.mockReturnValue([mockThread]);

        const result = getUnreadThreads('skye@sanmarinotennis.org');

        expect(result.length).toBe(1);
        expect(result[0].needsCannedResponse).toBe(true);
    });

    it('should NOT flag threads sent to a valid target email even if the bot is CCd', () => {
        CONFIG.ALLOWED_SENDERS = ['user@example.com'];
        CONFIG.VALID_TARGET_EMAILS = ['reservations@sanmarinotennis.org'];
        const mockThread = {
            getId: () => 'thread_valid',
            getFirstMessageSubject: () => 'Help with court',
            getMessages: () => [
                {
                    getId: () => 'msg_1',
                    getFrom: () => 'user@example.com',
                    getTo: () => 'reservations@sanmarinotennis.org, skye@sanmarinotennis.org',
                    getSubject: () => 'Help with court',
                    getDate: () => new Date(),
                    getPlainBody: () => 'Please help',
                    getBody: () => 'Please help',
                    getHeader: (name: string) => name === 'Message-ID' ? 'mock-id' : null,
                }
            ],
            markRead: jest.fn(),
        };

        mockSearch.mockReturnValue([mockThread]);

        const result = getUnreadThreads('skye@sanmarinotennis.org');

        expect(result.length).toBe(1);
        expect(result[0].needsCannedResponse).toBe(false);
    });
});
