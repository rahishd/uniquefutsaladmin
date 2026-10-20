// The Gamezone session clock: the booked hours run from the moment staff press Start; every started minute after that is
// billed at the session's hourly price / 60. Kept pure so the screen and the server work it out the same way.
export const GZ_EXTRA_MAX_MIN = 30; // longest extra time to allow; after this the screen keeps the alarm going until staff stop the session

// Whole minutes past the booked time, counting any started minute (1 second over = 1 minute).
export function extraMinutesAt(startedAt: Date, bookedMinutes: number, at: Date): number {
  const over = at.getTime() - (startedAt.getTime() + bookedMinutes * 60_000);
  return over > 0 ? Math.ceil(over / 60_000) : 0;
}

export const extraChargeFor = (hourlyRate: number, extraMinutes: number): number => Math.round((hourlyRate * extraMinutes) / 60);
