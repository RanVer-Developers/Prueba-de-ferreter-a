import type { ServiceOrderStatus, ServiceOrderType } from '../../schemas/services.schemas.js';

export type ServicesDomainEvent =
  | {
      type: 'ServiceOrderCreated';
      serviceOrderId: string;
      orderNumber: string;
      serviceType: ServiceOrderType;
      customerId: string;
      occurredAt: string;
    }
  | {
      type: 'ServiceOrderQuoted';
      serviceOrderId: string;
      estimatedTotalCents: number;
      occurredAt: string;
    }
  | {
      type: 'ServiceOrderApproved';
      serviceOrderId: string;
      approvedBy?: string;
      occurredAt: string;
    }
  | {
      type: 'ServicePartConsumed';
      serviceOrderId: string;
      productId: string;
      warehouseId: string;
      quantity: number;
      totalCents: number;
      occurredAt: string;
    }
  | {
      type: 'ServiceOrderStatusChanged';
      serviceOrderId: string;
      previousStatus: ServiceOrderStatus;
      newStatus: ServiceOrderStatus;
      occurredAt: string;
    }
  | {
      type: 'ServiceOrderDelivered';
      serviceOrderId: string;
      customerId: string;
      totalCents: number;
      warrantyExpiresAt?: string;
      occurredAt: string;
    };
