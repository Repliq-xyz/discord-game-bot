import { Prediction } from "../types/Prediction";
import { TokenService } from "./tokenService";
import { PredictionService } from "./predictionService";
import Queue from "bull";

interface PredictionJob {
  id: string;
  tokenAddress: string;
  expiresAt: Date;
  priceAtStart: number;
}

export class PredictionQueue {
  private static queue: Queue.Queue<PredictionJob>;
  private static isInitialized = false;

  static async initialize() {
    if (this.isInitialized) return;

    console.log("Initializing Redis connection...");
    console.log(
      `Connecting to Redis at ${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`
    );

    // Create a new queue
    this.queue = new Queue("prediction-queue", {
      redis: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT || "6379"),
        password: process.env.REDIS_PASSWORD,
        tls: {}, // Enable TLS for Railway Redis
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    });

    // Test Redis connection
    try {
      await this.queue.isReady();
      console.log("Successfully connected to Redis!");
    } catch (error) {
      console.error("Failed to connect to Redis:", error);
      throw error;
    }

    // Process jobs
    this.queue.process(async (job) => {
      const { id, tokenAddress, priceAtStart } = job.data;

      try {
        const currentPrice = await TokenService.getTokenPrice(tokenAddress);
        if (currentPrice === undefined) {
          throw new Error(`Could not get price for token ${tokenAddress}`);
        }

        await PredictionService.resolvePrediction(
          id,
          currentPrice,
          priceAtStart
        );
        console.log(`Successfully processed prediction ${id}`);
      } catch (error) {
        console.error(`Error processing prediction ${id}:`, error);
        throw error; // This will trigger a retry
      }
    });

    // Handle completed jobs
    this.queue.on("completed", (job) => {
      console.log(`Job ${job.id} completed for prediction ${job.data.id}`);
    });

    // Handle failed jobs
    this.queue.on("failed", (job, error) => {
      console.error(
        `Job ${job?.id} failed for prediction ${job?.data.id}:`,
        error
      );
    });

    this.isInitialized = true;
  }

  static async addPrediction(prediction: Prediction) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Calculate delay until expiration
    const delay = prediction.expiresAt.getTime() - Date.now();
    if (delay < 0) {
      console.warn(`Prediction ${prediction.id} has already expired`);
      return;
    }

    // Add job to queue with delay
    await this.queue.add(
      {
        id: prediction.id,
        tokenAddress: prediction.tokenAddress,
        expiresAt: prediction.expiresAt,
        priceAtStart: prediction.priceAtStart!,
      },
      {
        delay,
        jobId: prediction.id, // Use prediction ID as job ID to prevent duplicates
      }
    );

    console.log(
      `Added prediction ${prediction.id} to queue with delay ${delay}ms`
    );
  }

  static async getQueueStats() {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const [waiting, active, completed, failed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
    };
  }

  static async getFailedJobs() {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const failedJobs = await this.queue.getFailed();
    return failedJobs.map((job) => ({
      id: job.data.id,
      tokenAddress: job.data.tokenAddress,
      error: job.failedReason,
      attempts: job.attemptsMade,
    }));
  }

  static async retryFailedJob(jobId: string) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const job = await this.queue.getJob(jobId);
    if (job) {
      await job.retry();
    }
  }
}
