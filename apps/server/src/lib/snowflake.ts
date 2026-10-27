// Time-sortable 63-bit ids as zero-padded 19-digit decimal strings, so that
// lexicographic order (Postgres text) equals numeric/chronological order. Epoch: 2025-01-01.
const EPOCH = 1735689600000n;
let lastMs = 0n;
let seq = 0n;
const worker = BigInt(process.pid % 1024);

export function snowflake(): string {
  let now = BigInt(Date.now());
  if (now === lastMs) {
    seq = (seq + 1n) & 0xfffn;
    if (seq === 0n) {
      while (BigInt(Date.now()) <= lastMs) {
        /* spin until next ms */
      }
      now = BigInt(Date.now());
    }
  } else {
    seq = 0n;
  }
  lastMs = now;
  return (((now - EPOCH) << 22n) | (worker << 12n) | seq).toString().padStart(19, '0');
}

export function snowflakeTime(id: string): Date {
  return new Date(Number((BigInt(id) >> 22n) + EPOCH));
}

export function isSnowflake(v: unknown): v is string {
  return typeof v === 'string' && /^\d{19}$/.test(v);
}
