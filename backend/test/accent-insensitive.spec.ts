import {
  accentInsensitiveRegex,
  foldText,
} from '../src/common/accent-insensitive';

const finds = (query: string, name: string) =>
  accentInsensitiveRegex(query)!.test(name);

describe('foldText', () => {
  it.each([
    ['Nguyễn Đức Ánh', 'nguyen duc anh'],
    ['ĐẶNG HỮU PHƯỚC', 'dang huu phuoc'],
    ['Nguyễn'.normalize('NFD'), 'nguyen'],
    ['Müller Ñandú', 'muller nandu'],
    ['Йосиф'.normalize('NFD'), 'йосиф'], // other scripts keep their marks
    ['a1_b 😀', 'a1_b 😀'],
    ['\u0301', '\u0301'],
  ])('should fold %s', (text, expected) => {
    expect(foldText(text)).toBe(expected);
  });

  it('should fold every Vietnamese letter to its base letter', () => {
    const letters = {
      a: 'àáảãạăằắẳẵặâầấẩẫậ',
      d: 'đ',
      e: 'èéẻẽẹêềếểễệ',
      i: 'ìíỉĩị',
      o: 'òóỏõọôồốổỗộơờớởỡợ',
      u: 'ùúủũụưừứửữự',
      y: 'ỳýỷỹỵ',
    };
    for (const [base, accented] of Object.entries(letters)) {
      for (const letter of accented + accented.toUpperCase()) {
        expect(foldText(letter)).toBe(base);
        for (const form of [letter, letter.normalize('NFD')]) {
          expect(finds(base, form)).toBe(true);
          expect(finds(form, base)).toBe(true);
        }
      }
    }
  });
});

describe('accentInsensitiveRegex', () => {
  it.each([
    ['duc anh', 'Nguyễn Đức Ánh'],
    ['Đức Ánh', 'nguyen duc anh'],
    ['đức', 'ĐỨC'],
    ['dương', 'Dưỡng'], // a wrong accent still finds it
    ['GUYE', 'Nguyễn'], // partial
    ['phuoc', 'Hữu Phước'.normalize('NFD')],
    ['Hữu'.normalize('NFD'), 'Hữu Phước'],
    ['muller', 'Müller'],
    ['müller', 'MULLER'],
    ['йос', 'Йосиф'],
    ['😀', 'an 😀'],
    ['  an  ', 'an'],
  ])('should find %s in %s', (query, name) => {
    expect(finds(query, name)).toBe(true);
  });

  it.each([
    ['duc  anh', 'Đức Ánh'],
    ['anhh', 'Ánh'],
    ['b', 'Ánh'],
    ['и', 'й'],
  ])('should not find %s in %s', (query, name) => {
    expect(finds(query, name)).toBe(false);
  });

  it.each(['.*', 'a.c', '^an$', '(a|b)', '[a-z]', 'a\\d', 'x{2}', '$', '?+'])(
    'should take %s literally',
    (query) => {
      expect(finds(query, `x ${query} y`)).toBe(true);
      expect(finds(query, 'abc xx 1 an')).toBe(false);
    },
  );

  it('should have nothing to look for in an empty query', () => {
    expect(accentInsensitiveRegex('')).toBeNull();
    expect(accentInsensitiveRegex('   ')).toBeNull();
  });

  it('should stay a valid MongoDB pattern: no JS-only escapes, below the length limit', () => {
    const { source } = accentInsensitiveRegex('a'.repeat(100))!;
    expect(source).not.toMatch(/\\u/);
    expect(Buffer.byteLength(source)).toBeLessThan(32_764);
  });

  it('should answer at once for a long repeated query that does not match', () => {
    const started = Date.now();
    expect(finds('a'.repeat(100), 'á'.normalize('NFD').repeat(99) + 'b')).toBe(
      false,
    );
    expect(Date.now() - started).toBeLessThan(200);
  });
});
