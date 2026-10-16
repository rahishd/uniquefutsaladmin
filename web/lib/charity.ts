// The 3% Charity Fund: 3% of what a customer pays for a game, a Gamezone session, a membership or the club goes to
// children in need. It comes out of the venue's profit; it is NOT added to the price. It is worked out from the amount
// paid, so the same number shows while paying, after paying and on the bill.
export const CHARITY_PERCENT = 3;

/** 3% of an amount, to the paisa (Rs. 1,350 -> 40.5, Rs. 1,500 -> 45). */
export const charityOf = (amount: number) => Math.round(Math.max(0, amount) * CHARITY_PERCENT) / 100;

/** "Rs. 40.50", or "Rs. 45" when it is a whole number. */
export function charityText(amount: number) {
  const c = charityOf(amount);
  return "Rs. " + c.toLocaleString("en-IN", { minimumFractionDigits: Number.isInteger(c) ? 0 : 2, maximumFractionDigits: 2 });
}
