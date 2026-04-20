// Mocks the Global Google Apps Script objects that don't exist in the Node test environment

(global as any).GmailApp = {
    search: jest.fn(),
    getThreadById: jest.fn(),
};

(global as any).ScriptApp = {
    getProjectTriggers: jest.fn(),
    deleteTrigger: jest.fn(),
    newTrigger: jest.fn(),
};

(global as any).Session = {
    getEffectiveUser: () => ({
        getEmail: () => 'opti@opf.energy'
    })
};

// Required making setup.ts a module
export { };
