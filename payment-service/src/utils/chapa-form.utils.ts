// src/utils/chapa-form.utils.ts
import { URLSearchParams } from 'url';

export type SplitType = 'percentage' | 'flat' | 'fixed';

export interface ChapaSubaccount {
  id: string;
  split_type?: SplitType;
  split_value?: number | string;
}

/**
 * Build a URLSearchParams payload for Chapa initialize transaction.
 * Uses **un-indexed** bracket notation (subaccounts[id], subaccounts[split_type], subaccounts[split_value])
 * and repeats those keys for multiple subaccounts (Chapa accepts repeated form fields).
 */
export function buildChapaFormPayload(opts: {
  amount: number | string;
  currency?: string;
  tx_ref: string;
  return_url?: string;
  callback_url?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  customization?: { title?: string; description?: string };
  meta?: Record<string, any>;
  subaccounts: ChapaSubaccount[]; // one or more
}) {
  const params = new URLSearchParams();

  params.append('amount', String(opts.amount));
  if (opts.currency) params.append('currency', opts.currency);
  params.append('tx_ref', opts.tx_ref);

  if (opts.return_url) params.append('return_url', opts.return_url);
  if (opts.callback_url) params.append('callback_url', opts.callback_url);

  if (opts.email) params.append('email', opts.email);
  if (opts.first_name) params.append('first_name', opts.first_name);
  if (opts.last_name) params.append('last_name', opts.last_name);
  if (opts.phone_number) params.append('phone_number', opts.phone_number);

  if (opts.customization?.title) params.append('customization[title]', opts.customization.title);
  if (opts.customization?.description) params.append('customization[description]', opts.customization.description);

  if (opts.meta) {
    for (const [k, v] of Object.entries(opts.meta)) {
      // meta keys become meta[key]=value
      params.append(`meta[${k}]`, String(v));
    }
  }

  // IMPORTANT: Use un-indexed keys as Chapa examples show: subaccounts[id], subaccounts[split_type], ...
  // For multiple subaccounts we append multiple occurrences of the same key (that's valid in application/x-www-form-urlencoded)
  for (const sa of opts.subaccounts) {
    params.append('subaccounts[id]', sa.id);
    if (sa.split_type) params.append('subaccounts[split_type]', sa.split_type);
    if (sa.split_value !== undefined && sa.split_value !== null) {
      params.append('subaccounts[split_value]', String(sa.split_value));
    }
  }

  return params;
}
