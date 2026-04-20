import { CONFIG } from "../src/config";
import * as gmail from "../src/gmail";
import * as gemini from "../src/gemini";
import "../src/main";

describe("main.ts processEmailsTick", () => {
    let mockGetThreads: jest.SpyInstance;
    let mockGenerateGeminiResponse: jest.SpyInstance;
    let mockMarkThreadAsRead: jest.SpyInstance;
    let mockReplyAll: jest.Mock;
    let mockGetThreadById: jest.SpyInstance;

    beforeEach(() => {
        // Setup mocks
        mockGetThreads = jest.spyOn(gmail, "getThreads");
        mockGenerateGeminiResponse = jest.spyOn(gemini, "generateGeminiResponse");
        mockMarkThreadAsRead = jest.spyOn(gmail, "markThreadAsRead");
        mockReplyAll = jest.fn();

        (global as any).GmailApp = {
            getThreadById: jest.fn()
        };
        mockGetThreadById = jest.spyOn((global as any).GmailApp, "getThreadById");
        mockGetThreadById.mockReturnValue({
            replyAll: mockReplyAll
        });

        // Suppress console.log for clean test output
        jest.spyOn(console, "log").mockImplementation(() => { });
        jest.spyOn(console, "error").mockImplementation(() => { });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("should reply with both plain text and htmlBody when generating AI response", () => {
        const fakeAiResponse = "Hello,\n\nThis is a test.\nBest,\nSkye";
        const expectedBody = `${fakeAiResponse}\n\n${CONFIG.SIGNATURE}`;
        const expectedHtmlBody = expectedBody.replace(/\r?\n/g, "<br>");

        mockGetThreads.mockReturnValue([
            {
                threadId: "thread_test",
                subject: "Test Subject",
                messages: [],
                reachedMaxResponses: false,
                needsCannedResponse: false
            }
        ]);
        mockGenerateGeminiResponse.mockReturnValue(fakeAiResponse);

        // Execute the global function
        (globalThis as any).processEmailsTick();

        // Verify that replyAll was called correctly
        expect(mockReplyAll).toHaveBeenCalledWith(
            expectedBody,
            { htmlBody: expectedHtmlBody }
        );
        expect(mockMarkThreadAsRead).toHaveBeenCalledWith("thread_test");
    });

    it("should handle escalated threads and include htmlBody", () => {
        CONFIG.ENABLE_ESCALATIONS = true;
        CONFIG.ESCALATION_EMAIL = "escalated@opf.energy";
        const fakeEscalationResponse = CONFIG.MAX_RESPONSES_MESSAGE;
        const expectedHtmlBody = fakeEscalationResponse.replace(/\r?\n/g, "<br>");

        mockGetThreads.mockReturnValue([
            {
                threadId: "thread_escalated_test",
                subject: "Test Escalation",
                messages: [],
                reachedMaxResponses: true,
                needsCannedResponse: false
            }
        ]);

        (globalThis as any).processEmailsTick();

        expect(mockReplyAll).toHaveBeenCalledWith(
            fakeEscalationResponse,
            {
                bcc: CONFIG.ESCALATION_EMAIL,
                htmlBody: expectedHtmlBody
            }
        );
        expect(mockMarkThreadAsRead).toHaveBeenCalledWith("thread_escalated_test");
    });
});
