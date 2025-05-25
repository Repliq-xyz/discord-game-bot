import { PrismaClient } from "@prisma/client";

declare global {
  namespace PrismaJson {
    interface User {
      id: string;
      username: string;
      points: number;
      lastDailyClaim?: Date;
    }

    interface Prediction {
      id: string;
      userId: string;
      tokenAddress: string;
      tokenName: string;
      timeframe: string;
      direction: "UP" | "DOWN";
      createdAt: Date;
    }
  }
}

export {};
