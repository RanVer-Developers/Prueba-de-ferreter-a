import { CashRegister } from '../domain/entities/cash-register.js';

export interface ICashRegisterRepository {
  findById(id: string): Promise<CashRegister | null>;
  findAll(): Promise<CashRegister[]>;
  save(cashRegister: CashRegister): Promise<void>;
  delete?(id: string): Promise<void>;
}
