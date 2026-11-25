// Text for a search that ignores case and Latin accents ("anh" finds "Ánh", and the other way round;
// đ = d). Other scripts keep their marks. Mirrors backend/src/common/accent-insensitive.ts.
export function foldText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/([a-z])[\u0300-\u036f]+/gi, '$1')
    .normalize('NFC')
    .toLowerCase()
    .replace(/đ/g, 'd');
}
