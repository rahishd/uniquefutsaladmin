// Whole years between a date of birth and a day (both YYYY-MM-DD), or null when the birth date is not a real date.
export function ageOn(dob: string, today: string): number | null {
  const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  const t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  if (!b || !t) return null;
  const [by, bm, bd] = [Number(b[1]), Number(b[2]), Number(b[3])];
  const real = new Date(Date.UTC(by, bm - 1, bd));
  if (real.getUTCFullYear() !== by || real.getUTCMonth() !== bm - 1 || real.getUTCDate() !== bd) return null;
  let age = Number(t[1]) - by;
  if (Number(t[2]) < bm || (Number(t[2]) === bm && Number(t[3]) < bd)) age--;
  return age;
}
