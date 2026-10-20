// How a paid Gamezone session was paid. A session stores one payment method (the one that paid most of it), but staff can
// take part cash and part Fonepay; the exact amounts are in the payment log (event MARKED_PAID, written by the mark-paid call).
// Every report that adds up cash and Fonepay reads the split from here, so the two always agree.
import { prisma } from "../db";

export type GzSplit = { cash: number; fonepay: number };
const ONLINE = /fonepay|online|esewa/i;

export async function gzSplits(rows: { code: string; total: number; paymentMethod: string }[]): Promise<Map<string, GzSplit>> {
  const exact = new Map<string, GzSplit>();
  const all = new Map<string, GzSplit>();
  if (rows.length) {
    const events = await prisma.paymentEvent.findMany({
      where: { orderCode: { in: rows.map((r) => r.code) }, source: "staff", payload: { contains: "MARKED_PAID" } },
      orderBy: { receivedAt: "asc" }, select: { orderCode: true, payload: true },
    });
    for (const e of events) {
      try {
        const p = JSON.parse(e.payload) as { cash?: number; fonepay?: number };
        if (typeof p.cash === "number" && typeof p.fonepay === "number") {
          exact.set(e.orderCode, { cash: p.cash, fonepay: p.fonepay }); // the latest one wins
          const was = all.get(e.orderCode) ?? { cash: 0, fonepay: 0 };
          all.set(e.orderCode, { cash: was.cash + p.cash, fonepay: was.fonepay + p.fonepay }); // a prepaid session that ran over is paid twice: the first payment and the extra
        }
      } catch { /* an old or unreadable event: fall back to the session's method */ }
    }
  }
  const out = new Map<string, GzSplit>();
  for (const r of rows) {
    const whole = all.get(r.code);
    const s = whole && whole.cash + whole.fonepay === r.total ? whole : exact.get(r.code);
    out.set(r.code, s && s.cash + s.fonepay === r.total ? s : ONLINE.test(r.paymentMethod) ? { cash: 0, fonepay: r.total } : { cash: r.total, fonepay: 0 });
  }
  return out;
}
