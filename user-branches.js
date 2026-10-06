/** Manual user swipes: branch at the original turn and edit a blank variant. */
import { getContext } from '../../../extensions.js';
import { isGenerating, messageEdit } from '../../../../script.js';
import { branchChat } from '../../../../scripts/bookmarks.js';
import { getSettings } from './config.js';
import { captureUserSwipeInfo, isAnyMessageBeingEdited } from './utils.js';

let branching = false;

export async function createManualUserSwipe(messageId) {
    const context = getContext();
    const message = context.chat[messageId];
    const settings = getSettings();
    if (!settings.enabled || !settings.userSwipes) return 'User swipes disabled';
    if (!Number.isInteger(messageId) || !message?.is_user || message.is_system) {
        throw new Error('Select a user message to branch from.');
    }
    if (branching || isGenerating() || isAnyMessageBeingEdited()) {
        toastr.warning('Finish generation or message editing before creating a user branch.', 'Deep Swipe');
        return 'User branch busy';
    }

    branching = true;
    try {
        const sourceChatId = context.chatId;
        await context.saveChat();
        if (getContext().chatId !== sourceChatId || getContext().chat[messageId] !== message) {
            throw new Error('The chat changed before the user branch could be created.');
        }
        if (isGenerating() || isAnyMessageBeingEdited()) {
            toastr.warning('Finish generation or message editing before creating a user branch.', 'Deep Swipe');
            return 'User branch busy';
        }
        const branchName = await branchChat(messageId);
        if (!branchName) throw new Error('Could not create the user branch.');

        // branchChat loads a new chat: reacquire its context and message.
        const branchContext = getContext();
        const target = branchContext.chat[messageId];
        if (branchContext.chatId !== branchName || branchContext.chatId === sourceChatId || branchContext.chat.length !== messageId + 1 || !target?.is_user) {
            throw new Error('The user branch did not open at the selected turn.');
        }
        if (!Array.isArray(target.swipes) || !target.swipes.length) target.swipes = [target.mes];
        target.swipe_info ??= [];
        for (let i = 0; i < target.swipes.length; i++) {
            target.swipe_info[i] ??= {
                send_date: target.send_date,
                gen_started: target.gen_started,
                gen_finished: target.gen_finished,
                extra: structuredClone(target.extra || {}),
            };
        }
        captureUserSwipeInfo(target);
        target.swipes.push('');
        target.swipe_info.push({ send_date: target.send_date, extra: {} });
        target.swipe_id = target.swipes.length - 1;
        target.mes = '';
        target.extra = {};
        delete target.gen_started;
        delete target.gen_finished;

        await branchContext.saveChat();
        if (getContext().chatId !== branchName || getContext().chat[messageId] !== target) {
            throw new Error('The chat changed before the blank user editor could open.');
        }
        branchContext.addOneMessage(target, { type: 'swipe', forceId: messageId, scroll: true, showSwipes: true });
        await messageEdit(messageId);
        return `Opened blank user swipe in branch ${branchName}`;
    } finally {
        branching = false;
    }
}
