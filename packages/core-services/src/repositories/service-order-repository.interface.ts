import type {
  ServiceOrder,
  ServiceOrderStatus,
  ServiceOrderType,
} from '../schemas/services.schemas.js';

export interface ServiceOrderFilter {
  branchId?: string;
  customerId?: string;
  assignedTechnicianId?: string;
  type?: ServiceOrderType;
  status?: ServiceOrderStatus;
}

export interface IServiceOrderRepository {
  save(order: ServiceOrder, expectedVersion?: number): Promise<void>;
  findById(id: string): Promise<ServiceOrder | null>;
  findByIdempotencyKey(idempotencyKey: string): Promise<ServiceOrder | null>;
  findAll(filter?: ServiceOrderFilter): Promise<ServiceOrder[]>;
}
