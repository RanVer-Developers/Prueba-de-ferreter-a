import { useMemo } from 'react';
import { useCashierContext } from '../context/CashierContext.js';
import {
  CashBreakdown,
  CashierFeature,
  CashierFeatureFlags,
  CashMovement,
  CashReconciliation,
  CashRegister,
  CashShift,
  DrawerOpenRecord,
  Money,
  ShiftFinancialSummary,
  ShiftStatus,
  SuspensionRecord,
} from '@modulos/core-cashier';

const EMPTY_MOVEMENTS: ReadonlyArray<CashMovement> = [];
const EMPTY_SUSPENSIONS: ReadonlyArray<SuspensionRecord> = [];
const EMPTY_DRAWER_OPENS: ReadonlyArray<DrawerOpenRecord> = [];

export interface UseShiftResult {
  shift: CashShift | null;
  register: CashRegister | null;
  isOpen: boolean;
  isSuspended: boolean;
  isLocked: boolean;
  isClosed: boolean;
  status: ShiftStatus | null;
  expectedCash: Money | null;
  expectedCashFormatted: string;
  drawerBreakdown: CashBreakdown | null;
  summary: ShiftFinancialSummary | null;
  isCashLimitExceeded: boolean;
  movements: ReadonlyArray<CashMovement>;
  suspensionHistory: ReadonlyArray<SuspensionRecord>;
  drawerOpenHistory: ReadonlyArray<DrawerOpenRecord>;
  reconciliation?: CashReconciliation;
  features: CashierFeatureFlags;
  isFeatureEnabled: (feature: CashierFeature) => boolean;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Hook reactivo para consultar el estado actual del turno de caja y sus métricas financieras.
 */
export function useShift(): UseShiftResult {
  const { activeShift, activeRegister, features, isFeatureEnabled, isLoading, refresh } = useCashierContext();

  const summary = useMemo(() => {
    return activeShift ? activeShift.calculateSummary() : null;
  }, [activeShift]);

  const expectedCash = useMemo(() => {
    return activeShift ? activeShift.calculateExpectedCash() : null;
  }, [activeShift]);

  const expectedCashFormatted = useMemo(() => {
    if (expectedCash) return expectedCash.format();
    return Money.zero(activeRegister?.currency || 'USD').format();
  }, [expectedCash, activeRegister?.currency]);

  return {
    shift: activeShift,
    register: activeRegister,
    isOpen: activeShift ? activeShift.isOpen() : false,
    isSuspended: activeShift ? activeShift.isSuspended() : false,
    isLocked: activeShift ? activeShift.isLocked() : false,
    isClosed: activeShift ? activeShift.isClosed() : true,
    status: activeShift ? activeShift.status : null,
    expectedCash,
    expectedCashFormatted,
    drawerBreakdown: activeShift ? activeShift.drawerBreakdown : null,
    summary,
    isCashLimitExceeded: activeShift ? activeShift.isCashLimitExceeded() : false,
    movements: activeShift ? activeShift.movements : EMPTY_MOVEMENTS,
    suspensionHistory: activeShift ? activeShift.suspensionHistory : EMPTY_SUSPENSIONS,
    drawerOpenHistory: activeShift ? activeShift.drawerOpenHistory : EMPTY_DRAWER_OPENS,
    reconciliation: activeShift?.reconciliation,
    features,
    isFeatureEnabled,
    isLoading,
    refresh,
  };
}
