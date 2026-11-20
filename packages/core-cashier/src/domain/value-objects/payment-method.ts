import { Money } from './money.js';

export enum PaymentMethod {
  CASH = 'CASH',                     // Efectivo físico
  DEBIT_CARD = 'DEBIT_CARD',         // Tarjeta de débito
  CREDIT_CARD = 'CREDIT_CARD',       // Tarjeta de crédito
  BANK_TRANSFER = 'BANK_TRANSFER',   // Transferencia bancaria directa
  DIGITAL_WALLET = 'DIGITAL_WALLET', // QR / Billetera digital (MercadoPago, Yape, Bizum, etc.)
  VOUCHER = 'VOUCHER',               // Vales, cupones o tarjetas de regalo
  STORE_CREDIT = 'STORE_CREDIT',     // Crédito de la tienda / Cuenta corriente
  OTHER = 'OTHER',                   // Otros métodos
}

export interface PaymentItem {
  readonly method: PaymentMethod;
  readonly amount: Money;
  readonly reference?: string; // Número de operación, comprobante o autorización
}

export interface PaymentItemJSON {
  method: PaymentMethod;
  amount: number;
  reference?: string;
}
