import "./env";

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import request from "supertest";
import { app } from "../src/app";
import { prisma } from "../src/db";
import { addDaysKey, todayKey } from "../src/lib/dates";

export { app, prisma, request, todayKey, addDaysKey };
export const PASSWORD = "correct-horse-battery";

export async function reset() {
  for (const t of ["AdminAuditLog", "SlotBlock", "StaffUser", "BookingSlot", "PlayerGameStat", "PaymentEvent", "PaymentOrder", "LoyaltyEntry", "FreeGameVoucher", "GoodsSale", "ChallengeResult", "ChallengePrompt", "Challenge", "TeamMember", "Team", "GzSlot", "GzBooking", "GzConsole", "GzGame", "GzPlan", "ArrivalCheckin", "Notification", "UserPrefs", "Booking", "MembershipSubscription", "MembershipPlan", "User", "Settings"]) {
    await prisma.$executeRawUnsafe(`DELETE FROM "${t}"`);
  }
}

export async function staff(role: string, email = `${role}@test.np`) {
  const s = await prisma.staffUser.create({ data: { email, name: `${role} person`, role, passwordHash: await bcrypt.hash(PASSWORD, 4) } });
  const login = await request(app).post("/api/admin/auth/login").send({ email, password: PASSWORD });
  return { id: s.id, token: login.body.data.token as string, auth: { Authorization: `Bearer ${login.body.data.token}` } };
}

export const customer = (phone: string, name = "Test Player") =>
  prisma.user.create({ data: { phoneNumber: phone, name, password: "hash-not-exposed", role: "user", isVerified: true } });

export const customerToken = (phone: string) => jwt.sign({ id: phone, role: "user" }, "customer-secret-0123456789abcdef01");

export const api = {
  get: (path: string, auth: Record<string, string>) => request(app).get(`/api/admin${path}`).set(auth),
  post: (path: string, auth: Record<string, string>, body: object = {}) => request(app).post(`/api/admin${path}`).set(auth).send(body),
  put: (path: string, auth: Record<string, string>, body: object = {}) => request(app).put(`/api/admin${path}`).set(auth).send(body),
  patch: (path: string, auth: Record<string, string>, body: object = {}) => request(app).patch(`/api/admin${path}`).set(auth).send(body),
  del: (path: string, auth: Record<string, string>) => request(app).delete(`/api/admin${path}`).set(auth),
};
