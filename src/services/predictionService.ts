import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export interface CreatePredictionParams {
  userId: string;
  tokenAddress: string;
  tokenName: string;
  timeframe: string;
  direction: string;
}

export class PredictionService {
  static async createPrediction(params: CreatePredictionParams) {
    const expiresAt = this.calculateExpiryTime(params.timeframe);

    return prisma.prediction.create({
      data: {
        userId: params.userId,
        tokenAddress: params.tokenAddress,
        tokenName: params.tokenName,
        timeframe: params.timeframe,
        direction: params.direction,
        expiresAt,
      },
    });
  }

  static async getActivePredictions(userId: string) {
    return prisma.prediction.findMany({
      where: {
        userId,
        isResolved: false,
        expiresAt: {
          gt: new Date(),
        },
      },
    });
  }

  private static calculateExpiryTime(timeframe: string): Date {
    const now = new Date();
    switch (timeframe) {
      case "1m":
        return new Date(now.getTime() + 60 * 1000);
      case "1h":
        return new Date(now.getTime() + 60 * 60 * 1000);
      case "1d":
        return new Date(now.getTime() + 24 * 60 * 60 * 1000);
      default:
        throw new Error("Invalid timeframe");
    }
  }
}
