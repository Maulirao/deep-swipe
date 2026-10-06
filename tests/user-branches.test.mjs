import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// SillyTavern is a browser host, so replace only its module boundaries.
registerHooks({
    resolve(specifier, context, nextResolve) {
        const modules = {
            '../../../extensions.js': 'export const getContext = () => globalThis.host.context; export const extension_settings = globalThis.host.settings;',
            '../../../../script.js': `export const Generate = () => { throw new Error('Model generation must not run'); };
                export const isGenerating = () => globalThis.host.generating;
                export const messageEdit = async id => { globalThis.host.edited = id; globalThis.host.editorText = globalThis.host.context.chat[id].mes; };
                export const eventSource = { emit: async () => {}, on() {}, removeListener() {} };
                export const event_types = {}; export const cancelDebouncedChatSave = () => {};
                export const saveChatConditional = async () => {}; export const stopGeneration = () => {};`,
            '../../../../scripts/reasoning.js': 'export const updateReasoningUI = () => {}; export const ReasoningType = {};',
            '../../../../scripts/bookmarks.js': 'export const branchChat = async id => globalThis.host.branch(id);',
        };
        if (modules[specifier]) return { url: `data:text/javascript,${encodeURIComponent(modules[specifier])}`, shortCircuit: true };
        return nextResolve(specifier, context);
    },
});

globalThis.host = { settings: { 'deep-swipe': { enabled: true, userSwipes: true } } };
globalThis.toastr = { error() {}, warning() {}, info() {} };
globalThis.localStorage = { getItem: () => 'true' }; // Manual user swipes must work with Prompt Inspector.
globalThis.document = { querySelectorAll: () => [], querySelector: () => null };
const { dswipeBack, dswipeForward, generateMessageSwipe } = await import('../deep-swipe.js');
const { shouldAddUiComponents } = await import('../ui.js');

beforeEach(() => {
    host.generating = false;
    host.editing = false;
    host.edited = null;
    host.saves = [];
    host.branches = [];
    host.context = {
        chatId: 'original',
        chat: [
            { mes: 'Hello', is_user: false },
            { mes: 'My old turn', is_user: true, name: 'User', send_date: 'original-date', extra: { reasoning: 'old', model: 'old', image: 'old.png' } },
            { mes: 'Later reply', is_user: false },
        ],
        async saveChat() { host.saves.push(structuredClone(host.context.chat)); },
        addOneMessage(message, options) { host.rendered = { message, options }; },
    };
    host.original = host.context.chat;
    host.originalSnapshot = structuredClone(host.original);
    host.branch = async id => {
        host.branches.push(id);
        host.context = { ...host.context, chatId: 'branch', chat: structuredClone(host.original.slice(0, id + 1)) };
        return 'branch';
    };
    host.settings['deep-swipe'] = { enabled: true, userSwipes: true, assistantSwipes: true };
    document.querySelectorAll = () => host.editing ? [{}] : [];
});

test('forward on an old user turn branches there and opens a blank swipe without a model', async () => {
    await dswipeForward({}, 1);
    assert.deepEqual(host.branches, [1]);
    assert.deepEqual(host.original, host.originalSnapshot);
    assert.equal(host.context.chat.length, 2);
    assert.equal(host.context.chat[1].is_user, true);
    assert.equal(host.context.chat[1].name, 'User');
    assert.deepEqual(host.context.chat[1].swipes, ['My old turn', '']);
    assert.equal(host.context.chat[1].swipe_id, 1);
    assert.equal(host.context.chat[1].mes, '');
    assert.deepEqual(host.context.chat[1].extra, {});
    assert.equal(host.edited, 1);
    assert.equal(host.editorText, '');
    assert.equal(host.saves.at(-1)[1].mes, '');
});

test('direct user generation entry point also creates a manual branch', async () => {
    await generateMessageSwipe(host.context.chat[1], 1, host.context, true);
    assert.equal(host.context.chatId, 'branch');
    assert.equal(host.editorText, '');
});

test('existing user swipes navigate and persist without branching', async () => {
    Object.assign(host.context.chat[1], { swipes: ['My old turn', 'Other turn'], swipe_id: 0 });
    await dswipeForward({}, 1);
    assert.deepEqual(host.branches, []);
    assert.equal(host.context.chat[1].mes, 'Other turn');
    assert.equal(host.saves.at(-1)?.[1].mes, 'Other turn');
});

test('last user message has extension swipe controls', () => {
    host.context.chat.pop();
    const element = { getAttribute: name => ({ mesid: '1', is_user: 'true', is_system: 'false' })[name] };
    assert.equal(shouldAddUiComponents(element), true);
});

test('last assistant message continues using native controls', () => {
    const element = { getAttribute: name => ({ mesid: '2', is_user: 'false', is_system: 'false' })[name] };
    assert.equal(shouldAddUiComponents(element), false);
});

for (const state of ['generating', 'editing']) {
    test(`user branching is blocked while ${state}`, async () => {
        host[state] = true;
        await dswipeForward({}, 1);
        assert.deepEqual(host.branches, []);
        assert.deepEqual(host.original, host.originalSnapshot);
    });
}

test('branch failure leaves the source chat untouched', async () => {
    host.branch = async () => null;
    await assert.rejects(dswipeForward({}, 1), /branch/i);
    assert.deepEqual(host.original, host.originalSnapshot);
    assert.equal(host.edited, null);
});

test('double clicks create only one branch', async () => {
    await Promise.all([dswipeForward({}, 1), dswipeForward({}, 1)]);
    assert.deepEqual(host.branches, [1]);
});

test('previous user variant can be recovered and saved after creating a blank branch', async () => {
    await dswipeForward({}, 1);
    await dswipeBack({}, 1);
    assert.equal(host.context.chat[1].mes, 'My old turn');
    assert.equal(host.context.chat[1].swipe_id, 0);
    assert.equal(host.saves.at(-1)[1].mes, 'My old turn');
    assert.deepEqual(host.context.chat[1].extra, { reasoning: 'old', model: 'old', image: 'old.png' });
});

test('failed source save stops branching and releases the busy lock', async () => {
    host.context.saveChat = async () => { throw new Error('offline'); };
    await assert.rejects(dswipeForward({}, 1), /offline/);
    assert.deepEqual(host.branches, []);
    assert.deepEqual(host.original, host.originalSnapshot);
    host.context.saveChat = async () => {};
    await dswipeForward({}, 1);
    assert.equal(host.context.chatId, 'branch');
});

test('switching chats during source save aborts before branching', async () => {
    host.context.saveChat = async () => { host.context = { ...host.context, chatId: 'elsewhere' }; };
    await assert.rejects(dswipeForward({}, 1), /chat changed/i);
    assert.deepEqual(host.branches, []);
    assert.deepEqual(host.original, host.originalSnapshot);
});

test('a branch that fails to switch chats never blanks the source', async () => {
    host.branch = async () => 'branch';
    await assert.rejects(dswipeForward({}, 1), /did not open/i);
    assert.deepEqual(host.original, host.originalSnapshot);
});

test('disabled user swipes do not create a branch', async () => {
    host.settings['deep-swipe'].userSwipes = false;
    await dswipeForward({}, 1);
    assert.deepEqual(host.branches, []);
    assert.deepEqual(host.original, host.originalSnapshot);
});

test('switching to a different short chat during branching never blanks that chat', async () => {
    host.branch = async () => {
        host.context = { ...host.context, chatId: 'unrelated', chat: structuredClone(host.original.slice(0, 2)) };
        return 'branch';
    };
    await assert.rejects(dswipeForward({}, 1), /did not open/i);
    assert.equal(host.context.chat[1].mes, 'My old turn');
});

test('editing a manual variant preserves its current metadata when navigating away and back', async () => {
    await dswipeForward({}, 1);
    const message = host.context.chat[1];
    message.mes = 'My replacement';
    message.swipes[1] = 'My replacement';
    message.extra = { bias: 'new bias', file: { name: 'notes.txt', url: '/notes.txt' } };
    await dswipeBack({}, 1);
    await dswipeForward({}, 1);
    assert.equal(message.mes, 'My replacement');
    assert.deepEqual(message.extra, { bias: 'new bias', file: { name: 'notes.txt', url: '/notes.txt' } });
});

test('branch creation snapshots current user metadata over stale swipe metadata', async () => {
    const message = host.context.chat[1];
    message.swipes = ['My old turn'];
    message.swipe_id = 0;
    message.swipe_info = [{ extra: { bias: 'stale' } }];
    message.extra = { bias: 'current' };
    await dswipeForward({}, 1);
    await dswipeBack({}, 1);
    assert.deepEqual(host.context.chat[1].extra, { bias: 'current' });
});

for (const state of ['generating', 'editing']) {
    test(`starting ${state} during source save stops branch creation`, async () => {
        host.context.saveChat = async () => { host[state] = true; };
        await dswipeForward({}, 1);
        assert.deepEqual(host.branches, []);
        assert.deepEqual(host.original, host.originalSnapshot);
    });
}
