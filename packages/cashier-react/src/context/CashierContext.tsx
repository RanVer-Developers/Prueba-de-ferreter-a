import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  CashierFeature,
  CashierFeatureFlags,
  CashierFeatureProfile,
  CashRegister,
  CashShift,
  DomainEvent,
  IAuthorizationPolicy,
  ICashRegisterRepository,
  ICashShiftRepository,
  InMemoryCashRegisterRepository,
  InMemoryCashShiftRepository,
  isFeatureEnabled,
  ISignatureVerifier,
  RefundPolicyOptions,
  resolveCashierFeatures,
} from '@modulos/core-cashier';

export interface CashierOptions {
  authorizationPolicy?: IAuthorizationPolicy;
  signatureVerifier?: ISignatureVerifier;
  discrepancyTolerance?: number;
  requireSupervisorOnLockedClose?: boolean;
  refundPolicy?: RefundPolicyOptions;
  enforceCarryOverFloatOnOpen?: boolean;
  features?: CashierFeatureProfile;
}

export interface CashierContextValue {
  registerRepo: ICashRegisterRepository;
  shiftRepo: ICashShiftRepository;
  currentRegisterId: string;
  setCurrentRegisterId: (id: string) => void;
  activeShift: CashShift | null;
  lastShiftId: string | null;
  activeRegister: CashRegister | null;
  options?: CashierOptions;
  features: CashierFeatureFlags;
  isFeatureEnabled: (feature: CashierFeature) => boolean;
  isLoading: boolean;
  refresh: () => Promise<void>;
  publishEvent: (event: DomainEvent) => Promise<void>;
}

export const CashierContext = createContext<CashierContextValue | null>(null);

export interface CashierProviderProps {
  children: React.ReactNode;
  registerRepo?: ICashRegisterRepository;
  shiftRepo?: ICashShiftRepository;
  defaultRegisterId?: string;
  options?: CashierOptions;
  onDomainEvent?: (event: DomainEvent) => void | Promise<void>;
}

function cloneRegister(reg: CashRegister | null): CashRegister | null {
  return reg ? CashRegister.fromJSON(reg.toJSON()) : null;
}

function cloneShift(shift: CashShift | null): CashShift | null {
  return shift ? shift.clone() : null;
}

export const CashierProvider: React.FC<CashierProviderProps> = ({
  children,
  registerRepo: customRegisterRepo,
  shiftRepo: customShiftRepo,
  defaultRegisterId = 'default-register',
  options,
  onDomainEvent,
}) => {
  const registerRepo = useMemo(() => customRegisterRepo || new InMemoryCashRegisterRepository(), [customRegisterRepo]);
  const shiftRepo = useMemo(() => customShiftRepo || new InMemoryCashShiftRepository(), [customShiftRepo]);

  const [currentRegisterId, setCurrentRegisterId] = useState<string>(defaultRegisterId);
  const [activeShift, setActiveShift] = useState<CashShift | null>(null);
  const [lastShiftId, setLastShiftId] = useState<string | null>(null);
  const [activeRegister, setActiveRegister] = useState<CashRegister | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const hasLoadedRef = useRef<boolean>(false);
  const refreshSeqRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const seq = ++refreshSeqRef.current;
    if (!hasLoadedRef.current && isMountedRef.current) {
      setIsLoading(true);
    }
    try {
      const reg = await registerRepo.findById(currentRegisterId);
      if (!isMountedRef.current || seq !== refreshSeqRef.current) return;
      setActiveRegister(cloneRegister(reg));

      const shift = await shiftRepo.findActiveByCashRegisterId(currentRegisterId);
      if (!isMountedRef.current || seq !== refreshSeqRef.current) return;
      const cloned = cloneShift(shift);
      setActiveShift(cloned);
      if (cloned) {
        setLastShiftId(cloned.id);
      }
    } finally {
      if (isMountedRef.current && seq === refreshSeqRef.current) {
        hasLoadedRef.current = true;
        setIsLoading(false);
      }
    }
  }, [registerRepo, shiftRepo, currentRegisterId]);

  const publishEvent = useCallback(
    async (event: DomainEvent) => {
      if (onDomainEvent) {
        await onDomainEvent(event);
      }
    },
    [onDomainEvent]
  );

  useEffect(() => {
    hasLoadedRef.current = false;
    setLastShiftId(null);
    void refresh();
  }, [refresh]);

  const featuresKey = JSON.stringify(options?.features ?? null);
  const features = useMemo(
    () => resolveCashierFeatures(options?.features),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- serialized structural key avoids re-computation on inline options objects
    [featuresKey]
  );
  const checkFeature = useCallback(
    (feature: CashierFeature) => isFeatureEnabled(features, feature),
    [features]
  );

  const value = useMemo<CashierContextValue>(
    () => ({
      registerRepo,
      shiftRepo,
      currentRegisterId,
      setCurrentRegisterId,
      activeShift,
      lastShiftId,
      activeRegister,
      options,
      features,
      isFeatureEnabled: checkFeature,
      isLoading,
      refresh,
      publishEvent,
    }),
    [registerRepo, shiftRepo, currentRegisterId, activeShift, lastShiftId, activeRegister, options, features, checkFeature, isLoading, refresh, publishEvent]
  );

  return <CashierContext.Provider value={value}>{children}</CashierContext.Provider>;
};

export function useCashierContext(): CashierContextValue {
  const context = useContext(CashierContext);
  if (!context) {
    throw new Error('useCashierContext debe utilizarse dentro de un <CashierProvider>');
  }
  return context;
}
