import { getThreads, extractEmailAddress } from '../src/gmail';
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
                        getTo: () => 'help@opf.energy',
                        getSubject: () => 'Test Subject',
                        getDate: () => new Date(),
                        getPlainBody: () => 'Hello',
                        getBody: () => 'Hello',
                        getHeader: (name: string) => name === 'Message-ID' ? 'mock-id' : null,
                    },
                    {
                        getId: () => 'msg_2',
                        getFrom: () => 'opti@opf.energy', // Bot is the last sender
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

        const result = getThreads();

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
                        getFrom: () => 'opti@opf.energy', // Bot started the thread
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
                        getTo: () => 'help@opf.energy',
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

        const result = getThreads();

        expect(mockSearch).toHaveBeenCalled();
        // The thread should be parsed and returned
        expect(result.length).toBe(1);
        expect(result[0].threadId).toBe('thread_1');
        expect(result[0].messages.length).toBe(2);
        expect(result[0].isEscalated).toBe(false);
    });

    it('should skip but not flag threads where the bot has replied >10 times', () => {
        CONFIG.ENABLE_ESCALATIONS = true;
        // Generate 11 bot replies and 12 user messages
        const mockMessages = Array.from({ length: 23 }, (_, i) => ({
            getId: () => `msg_${i}`,
            getFrom: () => (i % 2 === 0 ? 'user@example.com' : 'opti@opf.energy'),
            getTo: () => 'help@opf.energy',
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

        const result = getThreads();

        expect(mockSearch).toHaveBeenCalled();
        // Since we removed the "exceeds MAX_BOT_RESPONSES, simply STOP responding" 
        // logic, it now *always* flags for escalation instead.
        expect(result.length).toBe(1);
        expect(result[0].messages.length).toBe(23);
        expect(result[0].isEscalated).toBe(true);
    });

    it('should return and flag threads where the bot has replied exactly 10 times', () => {
        CONFIG.ENABLE_ESCALATIONS = true;
        // Generate 10 bot replies and 11 user messages
        const mockMessages = Array.from({ length: 21 }, (_, i) => ({
            getId: () => `msg_${i}`,
            getFrom: () => (i % 2 === 0 ? 'user@example.com' : 'opti@opf.energy'),
            getTo: () => 'help@opf.energy',
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

        const result = getThreads();

        expect(mockSearch).toHaveBeenCalled();
        expect(result.length).toBe(1);
        expect(result[0].messages.length).toBe(21);
        expect(result[0].isEscalated).toBe(true);
    });

    it('should skip and mark read threads from ignored senders', () => {
        CONFIG.IGNORED_SENDERS = ['ignored@example.com'];
        const mockThread = {
            getId: () => 'thread_ignored',
            getFirstMessageSubject: () => 'Notification',
            getMessages: () => [
                {
                    getId: () => 'msg_1',
                    getFrom: () => 'ignored@example.com',
                    getTo: () => 'help@opf.energy',
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

        const result = getThreads();

        expect(result.length).toBe(0);
        expect(mockThread.markRead).toHaveBeenCalled();
    });

    it('should skip and mark read threads from ignored domains', () => {
        CONFIG.IGNORED_DOMAINS = ['ignored-domain.com'];
        const mockThread = {
            getId: () => 'thread_domain',
            getFirstMessageSubject: () => 'Internal memo',
            getMessages: () => [
                {
                    getId: () => 'msg_1',
                    getFrom: () => 'Staff Member <staff@ignored-domain.com>',
                    getTo: () => 'help@opf.energy',
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

        const result = getThreads();

        expect(result.length).toBe(0);
        expect(mockThread.markRead).toHaveBeenCalled();
    });


    it('should skip and mark read threads if the last message involves the escalation email', () => {
        // removed allowlist
        CONFIG.ENABLE_ESCALATIONS = true;
        CONFIG.ESCALATION_EMAIL = 'reservations+escalated@opf.energy';
        const mockThread = {
            getId: () => 'thread_escalated',
            getFirstMessageSubject: () => 'Help me',
            getMessages: () => [
                {
                    getId: () => 'msg_1',
                    getFrom: () => 'user@example.com',
                    getTo: () => 'help@opf.energy',
                    getSubject: () => 'Help me',
                    getDate: () => new Date(),
                    getPlainBody: () => 'I need human help',
                    getBody: () => 'I need human help',
                    getHeader: (name: string) => name === 'Message-ID' ? 'mock-id' : null,
                },
                {
                    getId: () => 'msg_2',
                    getFrom: () => 'user@example.com',
                    getTo: () => 'help@opf.energy, reservations+escalated@opf.energy',
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

        const result = getThreads();

        expect(result.length).toBe(0);
        expect(mockThread.markRead).toHaveBeenCalled();
    });

    it('should NOT skip threads if an earlier message involved the escalation email but the latest does not', () => {
        // removed allowlist
        CONFIG.ENABLE_ESCALATIONS = true;
        CONFIG.ESCALATION_EMAIL = 'reservations+escalated@opf.energy';
        const mockThread = {
            getId: () => 'thread_escalate_removed',
            getFirstMessageSubject: () => 'Help me',
            getMessages: () => [
                {
                    getId: () => 'msg_1',
                    getFrom: () => 'user@example.com',
                    getTo: () => 'help@opf.energy, reservations+escalated@opf.energy',
                    getSubject: () => 'Help me',
                    getDate: () => new Date(),
                    getPlainBody: () => 'I need human help',
                    getBody: () => 'I need human help',
                    getHeader: (name: string) => name === 'Message-ID' ? 'mock-id' : null,
                },
                {
                    getId: () => 'msg_2',
                    getFrom: () => 'user@example.com',
                    getTo: () => 'help@opf.energy',
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

        const result = getThreads();

        expect(result.length).toBe(1);
        expect(mockThread.markRead).not.toHaveBeenCalled();
    });

    it('should flag threads sent directly to the bot with needsCannedResponse = true', () => {
        // removed allowlist
        CONFIG.VALID_TARGET_EMAILS = ['help@opf.energy'];
        const mockThread = {
            getId: () => 'thread_direct',
            getFirstMessageSubject: () => 'Hello Bot',
            getMessages: () => [
                {
                    getId: () => 'msg_1',
                    getFrom: () => 'user@example.com',
                    getTo: () => 'opti@opf.energy',
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

        const result = getThreads();

        expect(result.length).toBe(1);
        expect(result[0].needsCannedResponse).toBe(true);
    });

    it('should NOT flag threads sent to a valid target email even if the bot is CCd', () => {
        // removed allowlist
        CONFIG.VALID_TARGET_EMAILS = ['help@opf.energy'];
        const mockThread = {
            getId: () => 'thread_valid',
            getFirstMessageSubject: () => 'Help with court',
            getMessages: () => [
                {
                    getId: () => 'msg_1',
                    getFrom: () => 'user@example.com',
                    getTo: () => 'help@opf.energy, opti@opf.energy',
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

        const result = getThreads();

        expect(result.length).toBe(1);
        expect(result[0].needsCannedResponse).toBe(false);
    });
    it('should ignore threads where a staff member (@opf.energy) has replied', () => {
        // removed allowlist
        const mockThread = {
            getId: () => 'thread_staff',
            getFirstMessageSubject: () => 'Information',
            getMessages: () => [
                {
                    getId: () => 'msg_1',
                    getFrom: () => 'user@example.com',
                    getTo: () => 'help@opf.energy',
                    getSubject: () => 'Information',
                    getDate: () => new Date(),
                    getPlainBody: () => 'Question',
                    getBody: () => 'Question',
                    getHeader: (name: string) => name === 'Message-ID' ? 'mock-id' : null,
                },
                {
                    getId: () => 'msg_2',
                    getFrom: () => 'rand@opf.energy', // Staff replied
                    getTo: () => 'user@example.com',
                    getSubject: () => 'Re: Information',
                    getDate: () => new Date(),
                    getPlainBody: () => 'Answer',
                    getBody: () => 'Answer',
                    getHeader: (name: string) => name === 'Message-ID' ? 'mock-id' : null,
                }
            ],
            markRead: jest.fn(),
        };

        mockSearch.mockReturnValue([mockThread]);

        const result = getThreads();

        expect(result.length).toBe(0);
        expect(mockThread.markRead).toHaveBeenCalled();
    });

    it('should NOT ignore threads if the bot is the only @opf.energy address that replied', () => {
        // removed allowlist
        const mockThread = {
            getId: () => 'thread_bot',
            getFirstMessageSubject: () => 'Information',
            getMessages: () => [
                {
                    getId: () => 'msg_1',
                    getFrom: () => 'opti@opf.energy', // Bot replied
                    getTo: () => 'user@example.com',
                    getSubject: () => 'Re: Information',
                    getDate: () => new Date(),
                    getPlainBody: () => 'Wait a moment',
                    getBody: () => 'Wait a moment',
                    getHeader: (name: string) => name === 'Message-ID' ? 'mock-id' : null,
                },
                {
                    getId: () => 'msg_2',
                    getFrom: () => 'user@example.com',
                    getTo: () => 'help@opf.energy',
                    getSubject: () => 'Re: Information',
                    getDate: () => new Date(),
                    getPlainBody: () => 'Ok',
                    getBody: () => 'Ok',
                    getHeader: (name: string) => name === 'Message-ID' ? 'mock-id' : null,
                }
            ],
            markRead: jest.fn(),
        };

        mockSearch.mockReturnValue([mockThread]);

        const result = getThreads();

        expect(result.length).toBe(1);
        expect(mockThread.markRead).not.toHaveBeenCalled();
    });
});
