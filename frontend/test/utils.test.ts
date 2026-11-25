import { describe, expect, it } from 'vitest';
import { initialsOf } from '@/lib/utils';

describe('initialsOf', () => {
  it.each([
    ['Nhóm Đồ Án', 'NĐ'],
    ['Nhóm  Đồ án', 'NĐ'], // two spaces
    ['  an\tbình ', 'AB'],
    ['Veltra', 'VE'],
    ['A', 'A'],
    ['🎉 Tiệc', '🎉T'],
    ['👨‍👩‍👧 Nhà mình', '👨‍👩‍👧N'],
    ['🇻🇳', '🇻🇳'],
    ['A\u0302n Bi\u0300nh', 'A\u0302B'], // decomposed accents stay with their letter
    ['', 'V'],
    ['   ', 'V'],
  ])('%j → %j', (name, initials) => {
    expect(initialsOf(name)).toBe(initials);
  });
});
