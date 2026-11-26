import { IAuthorizationPolicy } from './domain/services/authorization-policy.js';
import {
  CashierFeatureFlags,
  CashierFeatureProfile,
  resolveCashierFeatures,
} from './domain/services/cashier-features.js';
import { ISignatureVerifier } from './domain/services/signature-verifier.js';
import { ICashRegisterRepository } from './repositories/cash-register-repository.interface.js';
import { ICashShiftRepository } from './repositories/cash-shift-repository.interface.js';
import { InMemoryCashRegisterRepository } from './repositories/in-memory/in-memory-cash-register-repository.js';
import { InMemoryCashShiftRepository } from './repositories/in-memory/in-memory-cash-shift-repository.js';
import { AuditCountDTO, AuditCountUseCase } from './use-cases/audit-count.use-case.js';
import { CloseShiftDTO, CloseShiftUseCase } from './use-cases/close-shift.use-case.js';
import {
  ExchangeDenominationsDTO,
  ExchangeDenominationsUseCase,
} from './use-cases/exchange-denominations.use-case.js';
import { GenerateAuditReportUseCase } from './use-cases/generate-audit-report.use-case.js';
import {
  ConsolidatedSummaryQuery,
  GetConsolidatedSummaryUseCase,
} from './use-cases/get-consolidated-summary.use-case.js';
import { GetShiftSummaryUseCase } from './use-cases/get-shift-summary.use-case.js';
import { HandoverShiftDTO, HandoverShiftUseCase } from './use-cases/handover-shift.use-case.js';
import {
  CreateCashRegisterDTO,
  CreateCashRegisterUseCase,
  UpdateCashRegisterDTO,
  UpdateCashRegisterUseCase,
} from './use-cases/manage-cash-register.use-case.js';
import {
  OpenDrawerNoSaleDTO,
  OpenDrawerNoSaleUseCase,
} from './use-cases/open-drawer-no-sale.use-case.js';
import { EventPublisher, OpenShiftDTO, OpenShiftUseCase } from './use-cases/open-shift.use-case.js';
import { PayOutTipsDTO, PayOutTipsUseCase } from './use-cases/pay-out-tips.use-case.js';
import { RecordMovementDTO, RecordMovementUseCase } from './use-cases/record-movement.use-case.js';
import { RecordPaymentDTO, RecordPaymentUseCase } from './use-cases/record-payment.use-case.js';
import {
  RecordRefundDTO,
  RecordRefundUseCase,
  RefundPolicyOptions,
} from './use-cases/record-refund.use-case.js';
import { ResumeShiftDTO, ResumeShiftUseCase } from './use-cases/resume-shift.use-case.js';
import { SuspendShiftDTO, SuspendShiftUseCase } from './use-cases/suspend-shift.use-case.js';
import { VoidPaymentDTO, VoidPaymentUseCase } from './use-cases/void-payment.use-case.js';
import { VoidTransactionDTO, VoidTransactionUseCase } from './use-cases/void-transaction.use-case.js';

export interface CashierModuleDeps {
  registerRepo?: ICashRegisterRepository;
  shiftRepo?: ICashShiftRepository;
  publishEvent?: EventPublisher;
  authorizationPolicy?: IAuthorizationPolicy;
  signatureVerifier?: ISignatureVerifier;
  discrepancyTolerance?: number;
  requireSupervisorOnLockedClose?: boolean;
  refundPolicy?: RefundPolicyOptions;
  featureProfile?: CashierFeatureProfile;
}

export function createCashierModule(deps: CashierModuleDeps = {}) {
  const registerRepo = deps.registerRepo ?? new InMemoryCashRegisterRepository();
  const shiftRepo = deps.shiftRepo ?? new InMemoryCashShiftRepository();
  const features: CashierFeatureFlags = resolveCashierFeatures(deps.featureProfile);

  const createRegisterUseCase = new CreateCashRegisterUseCase(registerRepo);
  const updateRegisterUseCase = new UpdateCashRegisterUseCase(registerRepo);
  const openShiftUseCase = new OpenShiftUseCase(registerRepo, shiftRepo, deps.publishEvent);
  const recordPaymentUseCase = new RecordPaymentUseCase(shiftRepo, deps.publishEvent, { features });
  const recordMovementUseCase = new RecordMovementUseCase(shiftRepo, deps.publishEvent, { features });
  const recordRefundUseCase = new RecordRefundUseCase(shiftRepo, deps.publishEvent, {
    ...deps.refundPolicy,
    authorizationPolicy: deps.refundPolicy?.authorizationPolicy ?? deps.authorizationPolicy,
    features: deps.refundPolicy?.features ?? features,
  });
  const auditCountUseCase = new AuditCountUseCase(shiftRepo, deps.publishEvent, {
    authorizationPolicy: deps.authorizationPolicy,
    signatureVerifier: deps.signatureVerifier,
    features,
  });
  const closeShiftUseCase = new CloseShiftUseCase(registerRepo, shiftRepo, deps.publishEvent, {
    authorizationPolicy: deps.authorizationPolicy,
    signatureVerifier: deps.signatureVerifier,
    discrepancyTolerance: deps.discrepancyTolerance,
    requireSupervisorOnLockedClose: deps.requireSupervisorOnLockedClose,
    features,
  });
  const suspendShiftUseCase = new SuspendShiftUseCase(shiftRepo, deps.publishEvent);
  const resumeShiftUseCase = new ResumeShiftUseCase(
    shiftRepo,
    deps.publishEvent,
    deps.authorizationPolicy
  );
  const handoverShiftUseCase = new HandoverShiftUseCase(shiftRepo, deps.publishEvent, {
    authorizationPolicy: deps.authorizationPolicy,
    signatureVerifier: deps.signatureVerifier,
    features,
  });
  const voidPaymentUseCase = new VoidPaymentUseCase(shiftRepo, deps.publishEvent, {
    authorizationPolicy: deps.authorizationPolicy,
    features,
  });
  const voidTransactionUseCase = new VoidTransactionUseCase(shiftRepo, deps.publishEvent, {
    authorizationPolicy: deps.authorizationPolicy,
    features,
  });
  const exchangeDenominationsUseCase = new ExchangeDenominationsUseCase(
    shiftRepo,
    deps.publishEvent,
    { authorizationPolicy: deps.authorizationPolicy, features }
  );
  const payOutTipsUseCase = new PayOutTipsUseCase(shiftRepo, deps.publishEvent, {
    authorizationPolicy: deps.authorizationPolicy,
    features,
  });
  const openDrawerNoSaleUseCase = new OpenDrawerNoSaleUseCase(shiftRepo, deps.publishEvent, {
    authorizationPolicy: deps.authorizationPolicy,
    features,
  });
  const generateAuditReportUseCase = new GenerateAuditReportUseCase(shiftRepo, registerRepo);
  const getShiftSummaryUseCase = new GetShiftSummaryUseCase(shiftRepo);
  const getConsolidatedSummaryUseCase = new GetConsolidatedSummaryUseCase(
    shiftRepo,
    registerRepo,
    { features }
  );

  return {
    features,
    repositories: { registerRepo, shiftRepo },
    useCases: {
      createRegister: createRegisterUseCase,
      updateRegister: updateRegisterUseCase,
      openShift: openShiftUseCase,
      recordPayment: recordPaymentUseCase,
      recordMovement: recordMovementUseCase,
      recordRefund: recordRefundUseCase,
      auditCount: auditCountUseCase,
      closeShift: closeShiftUseCase,
      suspendShift: suspendShiftUseCase,
      resumeShift: resumeShiftUseCase,
      handoverShift: handoverShiftUseCase,
      voidPayment: voidPaymentUseCase,
      voidTransaction: voidTransactionUseCase,
      exchangeDenominations: exchangeDenominationsUseCase,
      payOutTips: payOutTipsUseCase,
      openDrawerNoSale: openDrawerNoSaleUseCase,
      generateAuditReport: generateAuditReportUseCase,
      getShiftSummary: getShiftSummaryUseCase,
      getConsolidatedSummary: getConsolidatedSummaryUseCase,
    },
    createRegister: (dto: CreateCashRegisterDTO) => createRegisterUseCase.execute(dto),
    updateRegister: (dto: UpdateCashRegisterDTO) => updateRegisterUseCase.execute(dto),
    openShift: (dto: OpenShiftDTO) => openShiftUseCase.execute(dto),
    recordPayment: (dto: RecordPaymentDTO) => recordPaymentUseCase.execute(dto),
    recordMovement: (dto: RecordMovementDTO) => recordMovementUseCase.execute(dto),
    recordRefund: (dto: RecordRefundDTO) => recordRefundUseCase.execute(dto),
    auditCount: (dto: AuditCountDTO) => auditCountUseCase.execute(dto),
    closeShift: (dto: CloseShiftDTO) => closeShiftUseCase.execute(dto),
    suspendShift: (dto: SuspendShiftDTO) => suspendShiftUseCase.execute(dto),
    resumeShift: (dto: ResumeShiftDTO) => resumeShiftUseCase.execute(dto),
    handoverShift: (dto: HandoverShiftDTO) => handoverShiftUseCase.execute(dto),
    voidPayment: (dto: VoidPaymentDTO) => voidPaymentUseCase.execute(dto),
    voidTransaction: (dto: VoidTransactionDTO) => voidTransactionUseCase.execute(dto),
    exchangeDenominations: (dto: ExchangeDenominationsDTO) =>
      exchangeDenominationsUseCase.execute(dto),
    payOutTips: (dto: PayOutTipsDTO) => payOutTipsUseCase.execute(dto),
    openDrawerNoSale: (dto: OpenDrawerNoSaleDTO) => openDrawerNoSaleUseCase.execute(dto),
    generateAuditReport: (shiftId: string, type: 'X' | 'Z') =>
      generateAuditReportUseCase.execute(shiftId, type),
    getShiftSummary: (shiftId: string) => getShiftSummaryUseCase.execute(shiftId),
    getConsolidatedSummary: (query?: ConsolidatedSummaryQuery) =>
      getConsolidatedSummaryUseCase.execute(query),
  };
}

export type CashierModule = ReturnType<typeof createCashierModule>;
