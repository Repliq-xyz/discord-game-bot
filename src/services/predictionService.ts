import { CreatePredictionParams, Prediction } from "../types/Prediction";
import { prisma } from "../lib/prisma";
import { UserService } from "./userService";
import { TokenService } from "./tokenService";
import { PredictionQueue } from "./predictionQueue";
import { EmbedBuilder, TextChannel } from "discord.js";
import { client } from "../index";

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
      // We don't throw here because the prediction is already created in the database
      // The queue will be retried on the next bot restart
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
              name: "Points",
              value: `${pointsToAdd > 0 ? "+" : ""}${pointsToAdd}`,
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
