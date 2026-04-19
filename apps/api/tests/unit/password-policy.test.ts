import { describe, expect, it } from 'vitest';
import { checkPasswordPolicy } from '../../src/utils/passwords.js';

describe('checkPasswordPolicy — zxcvbn-backed', () => {
  it('accepts strong passwords', () => {
    expect(() => checkPasswordPolicy('Tr0ub4dor&3Jklmn')).not.toThrow();
    expect(() => checkPasswordPolicy('correct horse battery staple')).not.toThrow();
  });

  it('rejects passwords shorter than 12 chars regardless of score', () => {
    expect(() => checkPasswordPolicy('Sh0rt!2')).toThrow(/at least 12/);
  });

  it('rejects low-entropy dictionary passwords', () => {
    expect(() => checkPasswordPolicy('password1234!')).toThrow(/too weak/i);
    expect(() => checkPasswordPolicy('qwertyuiop1234')).toThrow(/too weak/i);
  });

  it('rejects passwords personalized with the user email', () => {
    // Without userInputs this password scores 4; once the email is provided,
    // zxcvbn marks the variation as guessable.
    expect(() =>
      checkPasswordPolicy('myemail@foo.com1!', ['myemail@foo.com']),
    ).toThrow(/too weak/i);
  });
});
