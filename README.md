# Deep Swipe — Manual User Branches

A fork of [Rurijian/deep-swipe](https://github.com/Rurijian/deep-swipe) for writing your own alternative user turns in SillyTavern.

## User swipes

Click the right arrow on a user message. Existing variants still navigate normally. When you swipe past the last variant:

1. SillyTavern creates and opens a separate chat branch ending at that exact user turn.
2. The user message gets a new, empty swipe, keeping its previous variants.
3. Its inline message editor opens with a blank text area. Type your replacement and save the edit.
4. That user turn is now the conversation tip. Request an assistant response when you are ready.

No model request, impersonation prompt, or automatic assistant response runs for this action. The original conversation retains all later messages. The new branch is saved before editing, so cancelling the editor leaves a blank variant; use the left arrow to recover the previous text or delete the blank swipe.

User navigation also works on the final message of the new branch. Branching is blocked while generation, another branch operation, or message editing is in progress.

## Assistant swipes

Assistant messages retain upstream Deep Swipe behavior: navigate existing variants or generate an alternative response deep in the conversation. These operations still use a model. Assistant generation retains the upstream incompatibility with Prompt Inspector; manual user branching works while Prompt Inspector is enabled.

## Installation

Install this repository URL using SillyTavern's Extensions → Install extension:

`https://github.com/Maulirao/deep-swipe`

Refresh SillyTavern after installation. If the original Deep Swipe is installed, replace its installation with this fork rather than loading both copies. Both use the same settings and command identifiers.

In Extensions → Deep Swipe — Manual User Branches, enable **blank user swipes and branching** and **Deep Swipe navigation**. The user impersonation prompt has been removed. Assistant settings apply only to generated assistant swipes.

This extension uses SillyTavern's native `branchChat` and `messageEdit` exports. Both individual character chats and group chats use the native branch flow. No build step or dependency installation is required.

## Commands

- `/dswipe forward 3` (or `/ds forward 3`): navigate the next variant, or branch into a blank user swipe at message 3. For assistant messages, generates a new swipe after the last variant.
- `/dswipe back 3`: return to the previous variant.
- `/ddelswipe 3` (or `/dds 3`): delete the selected variant.

## Development

Run `npm test` with Node.js 24 or newer. The tests execute the extension's modules with SillyTavern host boundaries replaced, covering blank branch creation, conversation preservation, saved navigation, editor placement, and failure/busy handling. Check the native UI in your SillyTavern installation after installing.

## Credits and license

Original Deep Swipe by Rurijian. Manual user branching fork by Maulirao.

Upstream declares the project MIT licensed; this fork retains that declaration and the upstream source attribution.
