// Emoji for the composer picker. Plain Unicode text: the message is sent and stored as typed,
// shown with the system emoji font (no images, no extra package). Only emoji from Unicode ≤ 13
// (2020), so older phones and Windows 10 show them too.

export interface EmojiCategory {
  id: string;
  label: string;
  emojis: string[];
}

const list = (text: string) => text.split(' ');

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: 'smileys',
    label: 'Mặt cười',
    emojis: list(
      '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 💀 💩 🤡 👻 👽 🤖'
    ),
  },
  {
    id: 'gestures',
    label: 'Cử chỉ',
    emojis: list(
      '👍 👎 👌 🤌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👋 🤚 🖐️ ✋ 🖖 👏 🙌 👐 🤲 🤝 🙏 ✍️ 💪 🦾 👀 👁️ 👄 🧠 🙋 🙆 🙅 🤷 🤦 🙇 💁 🧑‍💻 👨‍👩‍👧 💃 🕺'
    ),
  },
  {
    id: 'hearts',
    label: 'Trái tim',
    emojis: list('❤️ 🧡 💛 💚 💙 💜 🤎 🖤 🤍 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 💋 💯 💢 💥 💫 💦 💨 🔥 ✨ ⭐ 🌟'),
  },
  {
    id: 'nature',
    label: 'Động vật',
    emojis: list(
      '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🦆 🦉 🐺 🐴 🦄 🐝 🦋 🐌 🐞 🐢 🐍 🐙 🐠 🐬 🐳 🦈 🌸 🌹 🌻 🌷 🌱 🌲 🌴 🍀 🍁 🌈 ☀️ 🌙 ⛅ 🌧️ ❄️ ⚡'
    ),
  },
  {
    id: 'food',
    label: 'Đồ ăn',
    emojis: list(
      '🍎 🍊 🍋 🍌 🍉 🍇 🍓 🥭 🍍 🥥 🥑 🍅 🌶️ 🌽 🥕 🍞 🧀 🥚 🍳 🥓 🍗 🍖 🍔 🍟 🍕 🌭 🥪 🌮 🍜 🍲 🍛 🍣 🍱 🥟 🍚 🍙 🍦 🍰 🎂 🍫 🍬 🍭 🍩 🍪 ☕ 🍵 🧋 🥤 🍺 🍻 🥂 🍷'
    ),
  },
  {
    id: 'activities',
    label: 'Hoạt động',
    emojis: list(
      '⚽ 🏀 🏈 ⚾ 🎾 🏐 🏸 🏓 🥊 🏆 🥇 🎉 🎊 🎈 🎁 🎄 🧧 🎮 🎲 🎯 🎵 🎶 🎤 🎧 🎸 🎹 🎬 📷 ✈️ 🚗 🛵 🚲 🚀 🏠 🏖️ ⛰️'
    ),
  },
  {
    id: 'objects',
    label: 'Đồ vật',
    emojis: list(
      '📱 💻 ⌚ 📞 💡 🔋 📚 📖 ✏️ 📝 📌 📎 ✂️ 🔒 🔑 🛒 💰 💸 💳 📦 📅 ⏰ ⌛ 🎓 💼 💊 🩺 🧸 🪄'
    ),
  },
  {
    id: 'symbols',
    label: 'Ký hiệu',
    emojis: list('✅ ❌ ❗ ❓ ⚠️ 🚫 ⭕ 🔴 🟢 🔵 ➡️ ⬅️ ⬆️ ⬇️ 🔄 🆗 🆕 🆒 🆘 💤 🎌 🇻🇳'),
  },
];

export const ALL_EMOJIS = new Set(EMOJI_CATEGORIES.flatMap((c) => c.emojis));

/**
 * `text` with `emoji` in place of the selection [start, end) (the caret when they are equal),
 * and the caret position right after it.
 */
export function insertAtSelection(
  text: string,
  start: number,
  end: number,
  emoji: string
): { text: string; caret: number } {
  const from = Math.max(0, Math.min(start, end, text.length));
  const to = Math.min(text.length, Math.max(start, end, from));
  return { text: text.slice(0, from) + emoji + text.slice(to), caret: from + emoji.length };
}

const graphemes =
  typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
// One emoji as drawn: a flag, a keycap, or a pictograph shown as emoji (by default, or with U+FE0F: a plain
// © or ™ is text), with a skin tone and ZWJ parts
const PICTOGRAPH = String.raw`(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}️)\p{Emoji_Modifier}?`;
const ONE_EMOJI = new RegExp(
  String.raw`^(?:\p{Regional_Indicator}{2}|[#*0-9]️?⃣|${PICTOGRAPH}(?:‍(?:${PICTOGRAPH}|\p{Extended_Pictographic}))*)$`,
  'u'
);

// 1 to 3 emoji and nothing else (spaces allowed): the bubble shows them large
export function isEmojiOnly(text: string, max = 3): boolean {
  const parts = graphemes
    ? Array.from(graphemes.segment(text), (s) => s.segment)
    : // Without Intl.Segmenter the text is never shown large
      null;
  if (!parts) return false;
  const visible = parts.filter((p) => p.trim() !== '');
  return visible.length > 0 && visible.length <= max && visible.every((p) => ONE_EMOJI.test(p));
}
