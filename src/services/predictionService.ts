import { CreatePredictionParams, Prediction } from "../types/Prediction";
import { prisma } from "../lib/prisma";
import { UserService } from "./userService";
import { TokenService } from "./tokenService";
import { PredictionQueue } from "./predictionQueue";

export class PredictionService {
  static async createPrediction(
    params: CreatePredictionParams
  ): Promise<Prediction> {
    console.log("Creating prediction with params:", {
      userId: params.userId,
      tokenAddress: params.tokenAddress,
      tokenName: params.tokenName,
      timeframe: params.timeframe,
      direction: params.direction,
      expiresAt: params.expiresAt,
    });

    // Get the current price of the token
    const priceAtStart = await TokenService.getTokenPrice(params.tokenAddress);
    console.log("Got initial price:", priceAtStart);

    // Create the prediction with the start price
    const prediction = await prisma.prediction.create({
      data: {
        userId: params.userId,
        tokenAddress: params.tokenAddress,
        tokenName: params.tokenName,
        timeframe: params.timeframe,
        direction: params.direction,
        expiresAt: params.expiresAt,
        priceAtStart,
      },
    });
    console.log("Created prediction in database:", prediction);

    // Add to processing queue
    console.log("Adding prediction to queue:", prediction.id);
    await PredictionQueue.addPrediction(prediction);
    console.log("Successfully added prediction to queue");

    return prediction;
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

  static async getPendingPredictions(): Promise<Prediction[]> {
    return prisma.prediction.findMany({
      where: {
        isResolved: false,
        expiresAt: {
          lte: new Date(),
        },
      },
    });
  }

  static async resolvePrediction(
    predictionId: string,
    priceAtEnd: number,
    priceAtStart: number
  ): Promise<Prediction> {
    console.log("Resolving prediction:", {
      predictionId,
      priceAtEnd,
      priceAtStart,
    });

    const prediction = await prisma.prediction.findUnique({
      where: { id: predictionId },
    });

    if (!prediction) {
      throw new Error("Prediction not found");
    }

    // If the prediction is already resolved, don't process it again
    if (prediction.isResolved) {
      console.log("Prediction already resolved:", predictionId);
      return prediction;
    }

    const isWon =
      prediction.direction === "UP"
        ? priceAtEnd > priceAtStart
        : priceAtEnd < priceAtStart;

    const pointsToAdd = isWon ? 10 : -5;
    console.log("Prediction result:", {
      predictionId,
      isWon,
      pointsToAdd,
      direction: prediction.direction,
      priceAtStart,
      priceAtEnd,
    });

    // Update user points
    await UserService.updatePoints(prediction.userId, pointsToAdd);
    console.log("Updated user points");

    // Update prediction
    const updatedPrediction = await prisma.prediction.update({
      where: { id: predictionId },
      data: {
        isResolved: true,
        isWon,
        priceAtStart,
        priceAtEnd,
      },
    });
    console.log("Updated prediction in database:", updatedPrediction);

    return updatedPrediction;
  }
}
