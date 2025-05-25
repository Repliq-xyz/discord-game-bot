import { CreatePredictionParams, Prediction } from "../types/Prediction";
import { prisma } from "../lib/prisma";
import { UserService } from "./userService";
import { TokenService } from "./tokenService";
import { PredictionQueue } from "./predictionQueue";
import { EmbedBuilder, TextChannel } from "discord.js";
import { client } from "../index";

// Maximum points that can be wagered based on timeframe
const MAX_WAGER_BY_TIMEFRAME = {
  "1m": 100, // 1 minute: max 100 points
  "1h": 500, // 1 hour: max 500 points
  "1d": 1000, // 1 day: max 1000 points
};

export class PredictionService {
  static async createPrediction(
    params: CreatePredictionParams & { pointsWagered: number }
  ): Promise<Prediction> {
    console.log("Creating prediction with params:", {
      userId: params.userId,
      tokenAddress: params.tokenAddress,
      tokenName: params.tokenName,
      timeframe: params.timeframe,
      direction: params.direction,
      expiresAt: params.expiresAt,
      pointsWagered: params.pointsWagered,
    });

    // Check if user has enough points
    const user = await UserService.getUserPoints(params.userId);
    if (user < params.pointsWagered) {
      throw new Error("Not enough points");
    }

    // Check if wager is within limits
    const maxWager =
      MAX_WAGER_BY_TIMEFRAME[
        params.timeframe as keyof typeof MAX_WAGER_BY_TIMEFRAME
      ];
    if (params.pointsWagered > maxWager) {
      throw new Error(
        `Maximum wager for ${params.timeframe} is ${maxWager} points`
      );
    }

    // Get the current price of the token
    const priceAtStart = await TokenService.getTokenPrice(params.tokenAddress);
    console.log("Got initial price:", priceAtStart);

    // Deduct points from user
    await UserService.updatePoints(params.userId, -params.pointsWagered);

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
        pointsWagered: params.pointsWagered,
      },
    });
    console.log("Created prediction in database:", prediction);

    try {
      // Add to processing queue
      console.log("Adding prediction to queue:", prediction.id);
      const job = await PredictionQueue.addPrediction(prediction);
      if (job) {
        console.log("Successfully added prediction to queue:", {
          predictionId: prediction.id,
          jobId: job.id,
        });
      } else {
        console.warn(
          "Prediction was not added to queue (possibly expired):",
          prediction.id
        );
      }
    } catch (error) {
      console.error("Failed to add prediction to queue:", {
        predictionId: prediction.id,
        error: error instanceof Error ? error.message : error,
      });
    }

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
      include: {
        user: true,
      },
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

    // Calculate points to add (double the wagered points if won, 0 if lost)
    const pointsToAdd = isWon ? prediction.pointsWagered * 2 : 0;
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
      include: {
        user: true,
      },
    });
    console.log("Updated prediction in database:", updatedPrediction);

    // Send message in feed channel
    try {
      const feedChannel = (await client.channels.fetch(
        process.env.FEED_CHANNEL_ID || ""
      )) as TextChannel;
      if (feedChannel) {
        const resultEmbed = new EmbedBuilder()
          .setColor(isWon ? "#00ff00" : "#ff0000")
          .setTitle("Prediction Result")
          .setDescription(
            `<@${prediction.userId}>'s prediction has been resolved!`
          )
          .addFields(
            { name: "Token", value: prediction.tokenName, inline: true },
            { name: "Direction", value: prediction.direction, inline: true },
            {
              name: "Result",
              value: isWon ? "✅ Won" : "❌ Lost",
              inline: true,
            },
            {
              name: "Points Wagered",
              value: `${prediction.pointsWagered}`,
              inline: true,
            },
            {
              name: "Points Won",
              value: isWon ? `+${pointsToAdd}` : "0",
              inline: true,
            },
            {
              name: "Price Change",
              value: `${(
                ((priceAtEnd - priceAtStart) / priceAtStart) *
                100
              ).toFixed(2)}%`,
              inline: true,
            }
          )
          .setTimestamp();

        await feedChannel.send({ embeds: [resultEmbed] });
      }
    } catch (error) {
      console.error("Error sending prediction result message:", error);
    }

    return updatedPrediction;
  }
}
