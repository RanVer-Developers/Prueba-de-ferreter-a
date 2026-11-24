import { InvalidAuthInputError } from '../errors/auth-rbac-errors.js';

export interface PasswordPolicy {
  minLength?: number;
  requireUppercase?: boolean;
  requireLowercase?: boolean;
  requireDigit?: boolean;
  requireSpecial?: boolean;
  disallowIdentifiers?: boolean;
}

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireDigit: true,
  requireSpecial: false,
  disallowIdentifiers: true,
};

export function assertPasswordPolicy(
  password: string,
  policy: PasswordPolicy,
  identifiers: ReadonlyArray<string | undefined> = []
): void {
  const minLength = policy.minLength ?? 6;
  if (password.length < minLength) {
    throw new InvalidAuthInputError(`Password must be at least ${minLength} characters long.`);
  }
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    throw new InvalidAuthInputError('Password must contain at least one uppercase letter.');
  }
  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    throw new InvalidAuthInputError('Password must contain at least one lowercase letter.');
  }
  if (policy.requireDigit && !/\d/.test(password)) {
    throw new InvalidAuthInputError('Password must contain at least one digit.');
  }
  if (policy.requireSpecial && !/[^A-Za-z0-9]/.test(password)) {
    throw new InvalidAuthInputError('Password must contain at least one special character.');
  }
  if (policy.disallowIdentifiers) {
    const lowerPw = password.toLowerCase();
    for (const rawId of identifiers) {
      const id = rawId?.trim().toLowerCase();
      if (id && id.length >= 3 && lowerPw.includes(id)) {
        throw new InvalidAuthInputError('Password cannot contain username or email.');
      }
    }
  }
}
