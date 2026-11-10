import { isDuplicateKeyError } from '../src/common/mongo-errors';

describe('isDuplicateKeyError', () => {
  it('should detect the MongoDB duplicate-key code', () => {
    expect(isDuplicateKeyError({ code: 11000, message: 'boom' })).toBe(true);
  });

  it('should detect E11000 in the message when the code is missing', () => {
    const err = new Error(
      'E11000 duplicate key error collection: conversations index: directKey_1',
    );

    expect(isDuplicateKeyError(err)).toBe(true);
  });

  it('should ignore other errors', () => {
    expect(isDuplicateKeyError({ code: 121, message: 'validation' })).toBe(
      false,
    );
    expect(isDuplicateKeyError(new Error('connection reset'))).toBe(false);
  });

  it('should return false for values that are not objects', () => {
    expect(isDuplicateKeyError(null)).toBe(false);
    expect(isDuplicateKeyError(undefined)).toBe(false);
    expect(isDuplicateKeyError('E11000')).toBe(false);
  });
});
