// Shared FaucetPay payout helper — the single payout path used by the
// shortlink callback, faucet claim, and PTC verify routes, so every reward
// leaves through the same automated API mechanism.
//
// Pattern (same for all flows): the DB records the reward first, then the
// payout is attempted. A failed payout never rolls the DB record back — the
// caller returns success with a warning, mirroring the shortlink behavior.
const FAUCETPAY_API = 'https://faucetpay.io/api/v1/send';

export type FaucetPayPayout = {
  ok: boolean;
  /** FaucetPay transaction id on success */
  txid?: string;
  /** Reason the payout did not go through */
  error?: string;
};

// FaucetPay's send API expects the amount in satoshis (1e-8 of the coin),
// which for TON matches the decimal rewards stored in the database
// (e.g. 0.0005 TON -> '50000').
export function toSatoshi(amount: number): string {
  return String(Math.round(amount * 1e8));
}

export async function sendFaucetPayPayout(params: {
  apiKey: string;
  /** User's registered FaucetPay email */
  to: string;
  amountSatoshi: string;
  currency: string;
}): Promise<FaucetPayPayout> {
  const form = new URLSearchParams();
  form.append('api_key', params.apiKey);
  form.append('to', params.to);
  form.append('amount', params.amountSatoshi);
  form.append('currency', params.currency);

  let res: Response;
  try {
    res = await fetch(FAUCETPAY_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'network_error' };
  }

  let raw: string;
  try {
    raw = await res.text();
  } catch {
    return { ok: false, error: 'unreadable_response' };
  }

  let data: { status?: number; id?: string; message?: string };
  try {
    data = JSON.parse(raw);
  } catch {
    console.error('[FAUCETPAY] Non-JSON response:', raw);
    return { ok: false, error: 'non_json_response' };
  }

  if (data.status === 200) {
    return { ok: true, txid: data.id };
  }
  console.error('[FAUCETPAY] Send rejected:', data);
  return { ok: false, error: data.message || `faucetpay_status_${data.status ?? 'unknown'}` };
}
