import { StockMovement, UserSummary } from '../domain/entities/stock-movement.js';
import { StockReservation } from '../domain/entities/stock-reservation.js';
import {
  InvalidQuantityError,
  ItemNotFoundError,
  ReservationExpiredError,
  ReservationNotFoundError,
} from '../domain/errors/inventory-errors.js';
import { IInventoryEventBus } from '../domain/events/inventory-events.js';
import { generateInventoryId } from '../domain/services/schema-validation.js';
import { Money } from '../domain/value-objects/money.js';
import { IInventoryItemRepository } from '../repositories/inventory-item-repository.interface.js';
import { IStockMovementRepository } from '../repositories/stock-movement-repository.interface.js';
import { IStockReservationRepository } from '../repositories/stock-reservation-repository.interface.js';

export interface ReserveRequest {
  action: 'RESERVE';
  reservationId: string;
  itemId: string;
  warehouseId: string;
  quantity: number;
  referenceId: string;
  ttlSeconds?: number;
  serialNumbers?: string[];
}

export interface ReleaseRequest {
  action: 'RELEASE';
  reservationId: string;
  itemId: string;
  warehouseId: string;
  quantity: number;
  serialNumbers?: string[];
  reason?: 'EXPIRED' | 'CANCELLED' | 'MANUAL';
}

export interface CommitRequest {
  action: 'COMMIT';
  reservationId: string;
  itemId: string;
  warehouseId: string;
  quantity: number;
  referenceId?: string;
  serialNumbers?: string[];
  performedBy: UserSummary;
  notes?: string;
  idempotencyKey?: string;
  referenceDate?: Date;
}

export type ReserveStockRequest = ReserveRequest | ReleaseRequest | CommitRequest;

export interface ReserveStockResponse {
  reservation?: StockReservation;
  movement?: StockMovement;
  totalCost?: Money;
}

export class ReserveStockUseCase {
  constructor(
    private readonly itemRepo: IInventoryItemRepository,
    private readonly movementRepo: IStockMovementRepository,
    private readonly reservationRepo?: IStockReservationRepository,
    private readonly eventBus?: IInventoryEventBus
  ) {}

  public async execute(request: ReserveStockRequest): Promise<ReserveStockResponse> {
    const item = await this.itemRepo.findById(request.itemId);
    if (!item) throw new ItemNotFoundError(request.itemId);

    if (request.action === 'RESERVE') {
      const reservation = item.reserveStock({
        reservationId: request.reservationId,
        warehouseId: request.warehouseId,
        quantity: request.quantity,
        referenceId: request.referenceId,
        ttlSeconds: request.ttlSeconds,
        serialNumbers: request.serialNumbers,
      });
      await this.itemRepo.save(item);
      if (this.reservationRepo) {
        try {
          await this.reservationRepo.save(reservation);
        } catch (err) {
          item.releaseReservation({
            warehouseId: request.warehouseId,
            quantity: request.quantity,
            reservationId: request.reservationId,
            serialNumbers: request.serialNumbers,
            reason: 'CANCELLED',
          });
          item.pullDomainEvents();
          await this.itemRepo.save(item);
          throw err;
        }
      }
      await this.publishEvents(item.pullDomainEvents());
      return { reservation };
    }

    if (request.action === 'RELEASE') {
      let updatedRes: StockReservation | undefined;
      if (this.reservationRepo) {
        const existing = await this.reservationRepo.findById(request.reservationId);
        if (!existing) throw new ReservationNotFoundError(request.reservationId);
        if (request.quantity !== existing.quantity) {
          throw new InvalidQuantityError(
            request.quantity,
            `La liberación (${request.quantity}) debe coincidir con la cantidad reservada (${existing.quantity}).`
          );
        }
        updatedRes = existing.release();
      }

      item.releaseReservation({
        warehouseId: request.warehouseId,
        quantity: request.quantity,
        reservationId: request.reservationId,
        serialNumbers: request.serialNumbers,
        reason: request.reason ?? 'MANUAL',
      });
      await this.itemRepo.save(item);
      if (this.reservationRepo && updatedRes) {
        try {
          await this.reservationRepo.save(updatedRes);
        } catch (err) {
          item.reserveStock({
            reservationId: updatedRes.id,
            warehouseId: updatedRes.warehouseId,
            quantity: updatedRes.quantity,
            referenceId: updatedRes.referenceId,
            serialNumbers: updatedRes.serialNumbers,
          });
          item.pullDomainEvents();
          await this.itemRepo.save(item);
          throw err;
        }
      }
      await this.publishEvents(item.pullDomainEvents());
      return { reservation: updatedRes };
    }

    // COMMIT
    let committedRes: StockReservation | undefined;
    if (this.reservationRepo) {
      const existing = await this.reservationRepo.findById(request.reservationId);
      if (!existing) throw new ReservationNotFoundError(request.reservationId);
      if (request.quantity !== existing.quantity) {
        throw new InvalidQuantityError(
          request.quantity,
          `La confirmación (${request.quantity}) debe coincidir con la cantidad reservada (${existing.quantity}).`
        );
      }
      const refDate = request.referenceDate ?? new Date();
      if (existing.isExpired(refDate)) {
        throw new ReservationExpiredError(existing.id, existing.expiresAt);
      }
      committedRes = existing.commit(refDate);
    }

    const movementId = generateInventoryId('mov-cmt');
    const { movement, totalCost } = item.commitReservation({
      movementId,
      warehouseId: request.warehouseId,
      quantity: request.quantity,
      reservationId: request.reservationId,
      referenceId: request.referenceId,
      serialNumbers: request.serialNumbers,
      performedBy: request.performedBy,
      notes: request.notes,
      idempotencyKey: request.idempotencyKey,
    });

    await this.itemRepo.save(item);
    try {
      if (this.reservationRepo && committedRes) {
        await this.reservationRepo.save(committedRes);
      }
      await this.movementRepo.save(movement);
    } catch (err) {
      const unitCost =
        request.quantity > 0
          ? Money.fromCents(Math.round(totalCost.toCents() / request.quantity), totalCost.currency)
          : item.averageCost;
      item.receiveStock({
        movementId: generateInventoryId('mov-rbk'),
        warehouseId: request.warehouseId,
        quantity: request.quantity,
        unitCost,
        performedBy: request.performedBy,
        notes: `Rollback commit reservation ${request.reservationId}`,
      });
      item.reserveStock({
        reservationId: request.reservationId,
        warehouseId: request.warehouseId,
        quantity: request.quantity,
        referenceId: committedRes?.referenceId ?? request.referenceId ?? request.reservationId,
        serialNumbers: request.serialNumbers,
      });
      item.pullDomainEvents();
      await this.itemRepo.save(item);
      throw err;
    }

    await this.publishEvents(item.pullDomainEvents());

    return { reservation: committedRes, movement, totalCost };
  }

  private async publishEvents(events: ReturnType<typeof Array.prototype.slice>): Promise<void> {
    if (this.eventBus && events.length > 0) {
      await this.eventBus.publish(events);
    }
  }
}
