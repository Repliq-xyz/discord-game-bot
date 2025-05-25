import { CreatePredictionParams, Prediction } from "../types/Prediction";
import { prisma } from "../lib/prisma";

export class PredictionService {
  static async createPrediction(
    params: CreatePredictionParams
  ): Promise<Prediction> {
    return prisma.prediction.create({
      data: {
        userId: params.userId,
        tokenAddress: params.tokenAddress,
        tokenName: params.tokenName,
        timeframe: params.timeframe,
        direction: params.direction,
        expiresAt: params.expiresAt,
      },
    });
  }

  static async getPredictions(userId: string): Promise<Prediction[]> {
    return prisma.prediction.findMany({
      where: {
        userId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }
}
