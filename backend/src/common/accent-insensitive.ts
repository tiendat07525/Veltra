// Search that ignores case and Latin accents ("anh" finds "Ánh", "ảnh", "ANH", and the other way
// round; đ = d). Mirrored in frontend/src/lib/fold-text.ts.

// Combining marks, as literal characters: the pattern also runs in MongoDB (PCRE has no \uXXXX)
const MARKS = '[\u0300-\u036f]';
const LATIN_WITH_MARKS = new RegExp(`([a-z])${MARKS}+`, 'gi');

// Other scripts keep their marks (й stays й)
export function foldText(text: string): string {
  return text
    .normalize('NFD')
    .replace(LATIN_WITH_MARKS, '$1')
    .normalize('NFC')
    .toLowerCase()
    .replace(/đ/g, 'd');
}

// 'a' -> 'aàáâ…ạảấ…': every lower-case letter of the Latin blocks that folds to it
const VARIANTS = new Map<string, string>();
for (const [first, last] of [
  [0x61, 0x7a], // a–z
  [0xc0, 0x24f], // Latin-1 Supplement, Extended-A, Extended-B
  [0x1e00, 0x1eff], // Extended Additional (Vietnamese)
]) {
  for (let code = first; code <= last; code++) {
    const letter = String.fromCharCode(code);
    const base = foldText(letter);
    // The i flag covers upper case
    if (/^[a-z]$/.test(base) && letter === letter.toLowerCase()) {
      VARIANTS.set(base, (VARIANTS.get(base) ?? '') + letter);
    }
  }
}

/**
 * Regex (JS and MongoDB) that finds `query` as typed text: special characters are escaped, stored
 * names match composed (NFC) or decomposed (NFD). null when nothing is left to look for.
 */
export function accentInsensitiveRegex(query: string): RegExp | null {
  const folded = foldText(query.trim());
  if (!folded) return null;
  const pattern = [...folded]
    .map((char) => {
      const variants = VARIANTS.get(char);
      if (variants) return `[${variants}]${MARKS}*`;
      return char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  return new RegExp(pattern, 'i');
}
