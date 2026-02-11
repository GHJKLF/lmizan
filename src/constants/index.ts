import { Currency } from '@/types';

export const ACCOUNTS: string[] = [
  // Banking
  'Wise EUR',
  'Wise USD',
  'Wise GBP',
  'Wise MAD',
  'CIH Bank',
  'CFG Bank',
  'Bank Al-Maghrib',
  // Processors
  'Stripe EUR',
  'Stripe USD',
  'Stripe GBP',
  'PayPal EUR',
  'PayPal USD',
  'PayPal GBP',
  'Payoneer USD',
  'Payoneer EUR',
  'WooCommerce',
  'Airwallex',
  'WorldFirst',
  // Crypto
  'Binance',
  // Assets
  'Asset - Home',
  'Asset - Car',
  'Asset - Renovation',
  'Asset - Inventory',
  'Asset - Aquablade Stock',
  'Asset - Madeco Stock',
];

export const CATEGORIES: string[] = [
  'Sales',
  'Inventory',
  'Marketing',
  'Software',
  'Logistics',
  'Operations',
  'Salary',
  'Assets',
  'Transfer',
  'Reserves',
  'Tax',
  'Other',
];

export const FX_RATES: Record<string, number> = {
  [Currency.EUR]: 1.0,
  [Currency.USD]: 0.92,
  [Currency.MAD]: 0.092,
  [Currency.GBP]: 1.17,
  [Currency.ILS]: 0.25,
  [Currency.DKK]: 0.134,
  [Currency.SEK]: 0.088,
  HKD: 0.12,
  CAD: 0.67,
  AUD: 0.60,
  CHF: 1.05,
  PLN: 0.23,
  NZD: 0.55,
  CNY: 0.13,
  JPY: 0.0063,
};
