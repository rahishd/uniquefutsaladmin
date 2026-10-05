import { PrismaClient } from "@prisma/client";
import "./config/env"; // fail fast on an unsafe DATABASE_URL

export const prisma = new PrismaClient();
export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
