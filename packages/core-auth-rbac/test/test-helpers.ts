import { IClock, IPasswordHasher, ITokenGenerator } from '../src/index.js';

export class ManualClock implements IClock {
  private current: Date;

  constructor(initialIso = '2026-11-17T12:00:00.000Z') {
    this.current = new Date(initialIso);
  }

  public now(): Date {
    return new Date(this.current.getTime());
  }

  public advanceMs(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export class TestPasswordHasher implements IPasswordHasher {
  public async hash(plainText: string): Promise<string> {
    return `hashed:${plainText}`;
  }

  public async verify(plainText: string, hash: string): Promise<boolean> {
    return hash === `hashed:${plainText}`;
  }
}

export class TestTokenGenerator implements ITokenGenerator {
  private counter = 0;

  public generateToken(): string {
    this.counter += 1;
    return `tok_${this.counter}_${Math.random().toString(36).slice(2, 8)}`;
  }

  public hashToken(rawToken: string): string {
    return `sha256:${rawToken}`;
  }
}
