import { ISessionRepository } from '../../contracts/auth-contracts.js';
import { AuthSession } from '../../domain/entities/session.js';
import { InMemoryRepositoryOptions } from './in-memory-user-repository.js';

export class InMemorySessionRepository implements ISessionRepository {
  private readonly sessions = new Map<string, AuthSession>();
  private readonly isolate: boolean;

  constructor(options: InMemoryRepositoryOptions = {}) {
    this.isolate = options.isolate ?? true;
  }

  public async findById(id: string): Promise<AuthSession | null> {
    const session = this.sessions.get(id);
    return session ? this.cloneIfNeeded(session) : null;
  }

  public async findByTokenHash(tokenHash: string): Promise<AuthSession | null> {
    for (const session of this.sessions.values()) {
      if (session.tokenHash === tokenHash) {
        return this.cloneIfNeeded(session);
      }
    }
    return null;
  }

  public async findByRefreshTokenHash(refreshTokenHash: string): Promise<AuthSession | null> {
    for (const session of this.sessions.values()) {
      if (session.refreshTokenHash === refreshTokenHash) {
        return this.cloneIfNeeded(session);
      }
    }
    return null;
  }

  public async findActiveByUserId(userId: string): Promise<AuthSession[]> {
    const result: AuthSession[] = [];
    for (const session of this.sessions.values()) {
      if (session.userId === userId && session.status === 'ACTIVE') {
        result.push(this.cloneIfNeeded(session));
      }
    }
    return result;
  }

  public async save(session: AuthSession): Promise<void> {
    this.sessions.set(session.id, this.cloneIfNeeded(session));
  }

  public async revokeAllForUser(userId: string, reason: string, now: Date): Promise<number> {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.userId === userId && session.status === 'ACTIVE') {
        session.revoke(reason, now);
        count += 1;
      }
    }
    return count;
  }

  public clear(): void {
    this.sessions.clear();
  }

  private cloneIfNeeded(session: AuthSession): AuthSession {
    return this.isolate ? AuthSession.fromJSON(session.toJSON()) : session;
  }
}
