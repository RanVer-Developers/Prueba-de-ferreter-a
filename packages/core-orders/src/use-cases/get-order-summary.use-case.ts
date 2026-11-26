import { z } from 'zod';
import { IOrderRepository } from '../contracts/order-contracts.js';
import { Order } from '../domain/entities/order.js';
import { OrderNotFoundError } from '../domain/errors/order-errors.js';
import { OrderPricingSummary } from '../domain/services/order-pricing.service.js';
import { parseWithSchema } from '../schemas/order-schemas.js';

const OrderIdSchema = z.string().trim().min(1, 'orderId is required.');

export interface GetOrderSummaryResult {
  order: Order;
  summary: OrderPricingSummary;
}

export class GetOrderSummaryUseCase {
  constructor(private readonly orderRepo: IOrderRepository) {}

  public async execute(orderId: string): Promise<GetOrderSummaryResult> {
    const cleanId = parseWithSchema(OrderIdSchema, orderId, 'orderId');
    const order = await this.orderRepo.findById(cleanId);
    if (!order) {
      throw new OrderNotFoundError(cleanId);
    }

    return {
      order,
      summary: order.calculateSummary(),
    };
  }
}
