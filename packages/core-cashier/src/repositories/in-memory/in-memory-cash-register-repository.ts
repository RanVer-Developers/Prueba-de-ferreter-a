import { CashRegister } from '../../domain/entities/cash-register.js';
import { ICashRegisterRepository } from '../cash-register-repository.interface.js';

export class InMemoryCashRegisterRepository implements ICashRegisterRepository {
  private readonly items = new Map<string, CashRegister>();

  public async findById(id: string): Promise<CashRegister | null> {
    const item = this.items.get(id);
    return item || null;
  }

  public async findAll(): Promise<CashRegister[]> {
    return Array.from(this.items.values());
  }

  public async save(cashRegister: CashRegister): Promise<void> {
    this.items.set(cashRegister.id, cashRegister);
  }

  public async delete(id: string): Promise<void> {
    this.items.delete(id);
  }

  public clear(): void {
    this.items.clear();
  }
}
