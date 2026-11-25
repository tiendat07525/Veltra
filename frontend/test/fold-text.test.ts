import { describe, expect, it } from 'vitest';
import { foldText } from '@/lib/fold-text';
import { userNameMatches } from '@/lib/user-search';

// Same cases as backend/test/accent-insensitive.spec.ts: both sides must fold the same way
describe('foldText', () => {
  it.each([
    ['Nguyễn Đức Ánh', 'nguyen duc anh'],
    ['ĐẶNG HỮU PHƯỚC', 'dang huu phuoc'],
    ['Nguyễn'.normalize('NFD'), 'nguyen'],
    ['Müller Ñandú', 'muller nandu'],
    ['Йосиф'.normalize('NFD'), 'йосиф'],
    ['a1_b 😀', 'a1_b 😀'],
    ['\u0301', '\u0301'],
  ])('folds %s', (text, expected) => {
    expect(foldText(text)).toBe(expected);
  });
});

describe('userNameMatches', () => {
  it('finds display name and username without accents, and the other way round', () => {
    expect(userNameMatches({ displayName: 'Nguyễn Đức', username: 'x' }, foldText('duc'))).toBe(true);
    expect(userNameMatches({ username: 'duc99' }, foldText('Đức'))).toBe(true);
    expect(userNameMatches({ displayName: 'Nguyễn Đức', username: 'x' }, foldText('anh'))).toBe(false);
    expect(userNameMatches({}, foldText('a'))).toBe(false);
  });
});
