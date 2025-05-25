import { CreatePredictionParams } from "../types/Prediction";
import { prisma } from "../lib/prisma";

export class PredictionService {
  static async createPrediction(params: CreatePredictionParams) {
    return prisma.prediction.create({
      data: {
        userId: params.userId,
        tokenAddress: params.tokenAddress,
        tokenName: params.tokenName,
        timeframe: params.timeframe,
        direction: params.direction,
      },
    });
  }

  static async getPredictions(userId: string) {
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
