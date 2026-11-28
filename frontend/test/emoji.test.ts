import { describe, expect, it } from 'vitest';
import { ALL_EMOJIS, EMOJI_CATEGORIES, insertAtSelection, isEmojiOnly } from '@/lib/emoji';

describe('EMOJI_CATEGORIES', () => {
  it('holds only single emoji, each once', () => {
    const all = EMOJI_CATEGORIES.flatMap((c) => c.emojis);
    expect(ALL_EMOJIS.size).toBe(all.length);
    for (const emoji of all) expect([emoji, isEmojiOnly(emoji, 1)]).toEqual([emoji, true]);
  });

  it('has a label for every category', () => {
    for (const c of EMOJI_CATEGORIES) expect(c.label && c.emojis.length).toBeTruthy();
  });
});

describe('insertAtSelection', () => {
  it('inserts at the caret and puts the caret after the emoji', () => {
    expect(insertAtSelection('ab', 1, 1, '😀')).toEqual({ text: 'a😀b', caret: 3 });
    expect(insertAtSelection('', 0, 0, '👍')).toEqual({ text: '👍', caret: 2 });
    expect(insertAtSelection('hi', 2, 2, '❤️')).toEqual({ text: 'hi❤️', caret: 4 });
  });

  it('replaces the selected text, in either direction', () => {
    expect(insertAtSelection('chào bạn', 5, 8, '🙂')).toEqual({ text: 'chào 🙂', caret: 7 });
    expect(insertAtSelection('chào bạn', 8, 5, '🙂')).toEqual({ text: 'chào 🙂', caret: 7 });
  });

  it('keeps positions inside the text', () => {
    expect(insertAtSelection('ab', 9, 9, '😀')).toEqual({ text: 'ab😀', caret: 4 });
    expect(insertAtSelection('ab', -3, -1, '😀')).toEqual({ text: '😀ab', caret: 2 });
  });
});

describe('isEmojiOnly', () => {
  it.each(['😀', ' 👍 ', '❤️❤️❤️', '👍🏽', '🧑‍💻', '👨‍👩‍👧', '🇻🇳', '1️⃣', '😀 😃\n😄'])('is true for %j', (text) => {
    expect(isEmojiOnly(text)).toBe(true);
  });

  it.each(['', '  ', 'ok', 'ok 👍', '😀😀😀😀', '123', '#', '©', '👍.', 'a❤️'])('is false for %j', (text) => {
    expect(isEmojiOnly(text)).toBe(false);
  });
});
