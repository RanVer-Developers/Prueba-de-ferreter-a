import {
  IClock,
  ICouponCatalog,
  IOrderRepository,
  OrderEventPublisher,
  SystemClock,
} from '../contracts/order-contracts.js';
import { Order } from '../domain/entities/order.js';
import {
  CurrencyMismatchError,
  DiscountNotFoundError,
  InvalidCouponError,
  OrderLineNotFoundError,
  OrderNotFoundError,
} from '../domain/errors/order-errors.js';
import { OrderDiscountAppliedEvent } from '../domain/events/order-events.js';
import {
  assertOrderFeatureEnabled,
  isOrderFeatureEnabled,
  OrderFeatureProfile,
  resolveOrderFeatures,
} from '../domain/services/order-features.js';
import { OrderPricingSummary } from '../domain/services/order-pricing.service.js';
import { divideHalfEven } from '../domain/value-objects/money.js';
import {
  ApplyOrderDiscountInput,
  ApplyOrderDiscountInputSchema,
  CouponDefinitionSchema,
  DiscountRule,
  parseWithSchema,
} from '../schemas/order-schemas.js';

export interface ApplyOrderDiscountResult {
  order: Order;
  discount: DiscountRule;
  summary: OrderPricingSummary;
  isReplay: boolean;
}

export class ApplyOrderDiscountUseCase {
  constructor(
    private readonly orderRepo: IOrderRepository,
    private readonly couponCatalog?: ICouponCatalog,
    private readonly publishEvent?: OrderEventPublisher,
    private readonly clock: IClock = SystemClock,
    private readonly defaultProfile?: OrderFeatureProfile
  ) {}

  public async execute(input: ApplyOrderDiscountInput): Promise<ApplyOrderDiscountResult> {
    const parsed = parseWithSchema(
      ApplyOrderDiscountInputSchema,
      input,
      'ApplyOrderDiscountInput'
    );
    const flags = resolveOrderFeatures(parsed.featureProfile ?? this.defaultProfile);

    const order = await this.orderRepo.findById(parsed.orderId);
    if (!order) {
      throw new OrderNotFoundError(parsed.orderId);
    }

    const scope: 'ORDER' | 'LINE' = parsed.lineId ? 'LINE' : 'ORDER';

    if (
      parsed.idempotencyKey &&
      isOrderFeatureEnabled(flags, 'offlineIdempotency') &&
      order.hasProcessedOperation(parsed.idempotencyKey)
    ) {
      const targetId = parsed.discount?.id ?? parsed.discountId;
      const normalizedCoupon = parsed.couponCode?.toUpperCase().trim();
      const pool =
        scope === 'LINE'
          ? order.lines.find((l) => l.lineId === parsed.lineId)?.discounts ?? []
          : order.orderDiscounts;

      const existingDiscount =
        (targetId ? pool.find((d) => d.id === targetId) : undefined) ??
        (normalizedCoupon ? pool.find((d) => d.couponCode === normalizedCoupon) : undefined);

      if (!existingDiscount) {
        throw new DiscountNotFoundError(
          targetId ?? normalizedCoupon ?? 'unknown',
          scope === 'LINE' ? `line '${parsed.lineId}'` : `order '${order.id}'`
        );
      }

      return {
        order,
        discount: existingDiscount,
        summary: order.calculateSummary(),
        isReplay: true,
      };
    }

    if (scope === 'LINE') {
      assertOrderFeatureEnabled(flags, 'lineDiscounts', 'Line-level discounts are disabled.');
    } else {
      assertOrderFeatureEnabled(flags, 'orderDiscounts', 'Order-level discounts are disabled.');
    }

    const now = this.clock.now();
    let resolvedDiscount: DiscountRule;
    let resolvedCouponCode: string | undefined;

    if (parsed.discount) {
      resolvedDiscount = {
        ...parsed.discount,
        couponCode: parsed.discount.couponCode?.toUpperCase().trim(),
      };
      resolvedCouponCode = resolvedDiscount.couponCode;
      if (resolvedCouponCode) {
        assertOrderFeatureEnabled(flags, 'coupons', 'Coupon discounts are disabled.');
      }
    } else {
      const code = parsed.couponCode!.toUpperCase().trim();
      assertOrderFeatureEnabled(flags, 'coupons', 'Coupon discounts are disabled.');

      if (!this.couponCatalog) {
        throw new InvalidCouponError(code, 'No coupon catalog configured to resolve coupon code.');
      }

      const rawCoupon = await this.couponCatalog.findByCode(code);
      if (!rawCoupon) {
        throw new InvalidCouponError(code, 'Coupon was not found.');
      }
      const coupon = parseWithSchema(CouponDefinitionSchema, rawCoupon, 'coupon definition');

      if (!coupon.isActive) {
        throw new InvalidCouponError(coupon.code, 'Coupon is inactive.');
      }
      if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() <= now.getTime()) {
        throw new InvalidCouponError(coupon.code, 'Coupon has expired.');
      }
      if (coupon.maxUses !== undefined && coupon.currentUses >= coupon.maxUses) {
        throw new InvalidCouponError(coupon.code, 'Coupon usage limit has been reached.');
      }
      if (coupon.currency && coupon.currency !== order.currency) {
        throw new CurrencyMismatchError(order.currency, coupon.currency);
      }

      const currentSummary = order.calculateSummary();
      let baseCents: number;
      if (scope === 'LINE') {
        const lineSummary = currentSummary.lines.find((l) => l.lineId === parsed.lineId);
        if (!lineSummary) {
          throw new OrderLineNotFoundError(order.id, parsed.lineId!);
        }
        baseCents = Math.max(
          0,
          lineSummary.grossAmount.toCents() - lineSummary.lineDiscountAmount.toCents()
        );
      } else {
        baseCents = Math.max(
          0,
          currentSummary.grossSubtotal.toCents() -
            currentSummary.lineDiscountTotal.toCents() -
            currentSummary.orderDiscountTotal.toCents()
        );
      }

      if (coupon.minOrderAmountCents !== undefined && baseCents < coupon.minOrderAmountCents) {
        throw new InvalidCouponError(
          coupon.code,
          `Minimum eligible amount of ${coupon.minOrderAmountCents} minor units was not met.`
        );
      }

      let discountType = coupon.discountType;
      let discountValue = coupon.value;
      if (
        coupon.discountType === 'PERCENTAGE' &&
        coupon.maxDiscountAmountCents !== undefined
      ) {
        const scaledRate = BigInt(Math.round(coupon.value * 10_000));
        const projected = divideHalfEven(BigInt(baseCents) * scaledRate, 1_000_000n);
        if (projected > coupon.maxDiscountAmountCents) {
          discountType = 'FIXED_AMOUNT';
          discountValue = coupon.maxDiscountAmountCents;
        }
      }

      resolvedCouponCode = coupon.code;
      resolvedDiscount = {
        id: parsed.discountId ?? `coupon-${coupon.code}`,
        type: discountType,
        value: discountValue,
        couponCode: coupon.code,
        reason: `Coupon ${coupon.code}`,
      };
    }

    if (scope === 'LINE') {
      order.applyLineDiscount(parsed.lineId!, resolvedDiscount, {
        now,
        flags,
        idempotencyKey: parsed.idempotencyKey,
      });
    } else {
      order.applyOrderDiscount(resolvedDiscount, {
        now,
        flags,
        idempotencyKey: parsed.idempotencyKey,
      });
    }

    await this.orderRepo.save(order);
    if (resolvedCouponCode && this.couponCatalog?.incrementUsage) {
      await this.couponCatalog.incrementUsage(resolvedCouponCode);
    }

    const summary = order.calculateSummary();
    if (this.publishEvent) {
      await this.publishEvent(
        new OrderDiscountAppliedEvent(
          order.id,
          resolvedDiscount,
          scope,
          summary,
          parsed.lineId,
          now
        )
      );
    }

    return {
      order,
      discount: resolvedDiscount,
      summary,
      isReplay: false,
    };
  }
}
