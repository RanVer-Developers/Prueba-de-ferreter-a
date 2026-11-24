import { IAuditRepository } from '../../contracts/auth-contracts.js';
import { AuditEntryJSON } from '../../schemas/auth-rbac.schemas.js';

export class InMemoryAuditRepository implements IAuditRepository {
  private readonly entries: AuditEntryJSON[] = [];

  public async append(entry: AuditEntryJSON): Promise<void> {
    this.entries.push({
      ...entry,
      ...(entry.scope ? { scope: { ...entry.scope } } : {}),
    });
  }

  public async findByUserId(userId: string, limit?: number): Promise<AuditEntryJSON[]> {
    const matched = this.entries
      .filter((e) => e.actorId === userId || e.targetUserId === userId)
      .map((e) => ({
        ...e,
        ...(e.scope ? { scope: { ...e.scope } } : {}),
      }));
    if (limit !== undefined && limit > 0) {
      return matched.slice(-limit);
    }
    return matched;
  }

  public listAll(): ReadonlyArray<AuditEntryJSON> {
    return this.entries.map((e) => ({
      ...e,
      ...(e.scope ? { scope: { ...e.scope } } : {}),
    }));
  }

  public clear(): void {
    this.entries.length = 0;
  }
}
