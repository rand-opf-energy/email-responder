import { generateGeminiResponse } from '../src/gemini';
import { CONFIG } from '../src/config';
import { ParsedThread } from '../src/gmail';

describe('gemini.ts response generation', () => {
    let mockUrlFetch: any;
    let mockDocumentApp: any;
    let originalSystemInstructionDocId: string;
    let originalContextDocIds: string[] | undefined;

    beforeEach(() => {
        // Setup mock for Vertex API call
        (global as any).UrlFetchApp = {
            fetch: jest.fn()
        };
        mockUrlFetch = jest.spyOn((global as any).UrlFetchApp, 'fetch');
        mockUrlFetch.mockReturnValue({
            getResponseCode: () => 200,
            getContentText: () => JSON.stringify({
                candidates: [{ content: { parts: [{ text: "Mocked response" }] } }]
            })
        });

        // Setup mock for Google Docs call
        // Using any to bypass TS complaining about missing globals
        (global as any).DocumentApp = {
            openById: jest.fn()
        };
        mockDocumentApp = jest.spyOn((global as any).DocumentApp, 'openById');

        // Mock getOAuthToken
        (global as any).ScriptApp = {
            getOAuthToken: jest.fn()
        };
        jest.spyOn((global as any).ScriptApp, 'getOAuthToken').mockReturnValue('mock-token');

        originalSystemInstructionDocId = CONFIG.SYSTEM_INSTRUCTION_DOC_ID;
        originalContextDocIds = CONFIG.CONTEXT_DOC_IDS ? [...CONFIG.CONTEXT_DOC_IDS] : undefined;
    });

    afterEach(() => {
        CONFIG.SYSTEM_INSTRUCTION_DOC_ID = originalSystemInstructionDocId;
        if (originalContextDocIds !== undefined) {
            CONFIG.CONTEXT_DOC_IDS = originalContextDocIds;
        } else {
            CONFIG.CONTEXT_DOC_IDS = [] as string[];
        }
        jest.restoreAllMocks();
    });

    const mockThread: ParsedThread = {
        threadId: "test_thread",
        subject: "Test Subject",
        messages: [
            {
                id: "msg_1",
                sender: "user@example.com",
                recipient: "help@opf.energy",
                subject: "Test Subject",
                date: new Date("2026-02-27T10:00:00Z") as any, // bypass GAS types
                body: "When is the clinic?",
            },
        ],
    };

    it('should append document content to system instruction when CONTEXT_DOC_IDS is configured', () => {
        CONFIG.SYSTEM_INSTRUCTION_DOC_ID = "primary_system_doc";
        CONFIG.CONTEXT_DOC_IDS = ["doc_123", "doc_456"] as string[];

        mockDocumentApp.mockImplementation((id: string) => {
            if (id === 'primary_system_doc') {
                return {
                    getName: () => 'System Prompt',
                    getBody: () => ({ getText: () => 'You are Skye, a helpful AI.' })
                }
            } else if (id === 'doc_123') {
                return {
                    getName: () => 'Junior Schedule',
                    getBody: () => ({ getText: () => 'Junior clinics run Monday to Friday at 4 PM.' })
                };
            } else if (id === 'doc_456') {
                return {
                    getName: () => 'Adult Schedule',
                    getBody: () => ({ getText: () => 'Adult clinics run Saturday at 9 AM.' })
                };
            }
            throw new Error('Not found');
        });

        generateGeminiResponse(mockThread);

        expect(mockDocumentApp).toHaveBeenCalledTimes(3);

        // Assert the payload passed to UrlFetchApp has the modified systemInstruction
        const fetchCall = mockUrlFetch.mock.calls[0];
        const options = fetchCall[1];
        const payload = JSON.parse(options.payload);

        const actualInstruction = payload.systemInstruction.parts[0].text;
        expect(actualInstruction).toContain('You are Skye, a helpful AI.');
        expect(actualInstruction).toContain('--- REFERENCE DOCUMENTATION ---');
        expect(actualInstruction).toContain('Document Title: Junior Schedule');
        expect(actualInstruction).toContain('Junior clinics run Monday to Friday at 4 PM.');
        expect(actualInstruction).toContain('Document Title: Adult Schedule');
        expect(actualInstruction).toContain('Adult clinics run Saturday at 9 AM.');
    });

    it('should throw an error loudly if any document fails to fetch', () => {
        CONFIG.SYSTEM_INSTRUCTION_DOC_ID = "primary_system_doc";
        CONFIG.CONTEXT_DOC_IDS = ["bad_doc", "good_doc"] as string[];

        mockDocumentApp.mockImplementation((id: string) => {
            if (id === 'primary_system_doc') {
                return {
                    getName: () => 'System Prompt',
                    getBody: () => ({ getText: () => 'You are Skye, a helpful AI.' })
                }
            } else if (id === 'bad_doc') {
                throw new Error('Permission denied');
            } else if (id === 'good_doc') {
                return {
                    getName: () => 'Adult Schedule',
                    getBody: () => ({ getText: () => 'Adult clinics run Saturday at 9 AM.' })
                };
            }
        });

        expect(() => {
            generateGeminiResponse(mockThread);
        }).toThrow('Permission denied');

        // Assert that the API was never actually called because we failed early
        expect(mockUrlFetch).not.toHaveBeenCalled();
    });

    it('should not modify system instruction if no doc ids are configured', () => {
        CONFIG.SYSTEM_INSTRUCTION_DOC_ID = "primary_system_doc";
        CONFIG.CONTEXT_DOC_IDS = [] as string[];

        mockDocumentApp.mockImplementation((id: string) => {
            if (id === 'primary_system_doc') {
                return {
                    getName: () => 'System Prompt',
                    getBody: () => ({ getText: () => 'You are Skye, a helpful AI.' })
                }
            }
        });

        generateGeminiResponse(mockThread);

        expect(mockDocumentApp).toHaveBeenCalledTimes(1);

        const fetchCall = mockUrlFetch.mock.calls[0];
        const options = fetchCall[1];
        const payload = JSON.parse(options.payload);

        const actualInstruction = payload.systemInstruction.parts[0].text;
        expect(actualInstruction).toBe("You are Skye, a helpful AI.");
        expect(actualInstruction).not.toContain('--- REFERENCE DOCUMENTATION ---');
    });
});

