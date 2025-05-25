import { Prediction } from "../types/Prediction";
import { TokenService } from "./tokenService";
import { PredictionService } from "./predictionService";
import Queue from "bull";

interface PredictionJob {
  id: string;
  tokenAddress: string;
  priceAtStart?: number;
  expiresAt: Date;
}

export class PredictionQueue {
  private static queue: Queue.Queue<PredictionJob>;
  private static instance: PredictionQueue | null = null;

  private constructor() {
    // Create a new queue
    PredictionQueue.queue = new Queue("prediction-queue", {
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

    // Process jobs
    PredictionQueue.queue.process(async (job) => {
      const { id, tokenAddress, priceAtStart } = job.data;

      try {
        const currentPrice = await TokenService.getTokenPrice(tokenAddress);
        if (currentPrice === undefined) {
          throw new Error(`Could not get price for token ${tokenAddress}`);
        }

        await PredictionService.resolvePrediction(
          id,
          currentPrice,
          priceAtStart || currentPrice // Use current price as fallback
        );
        console.log(`Successfully processed prediction ${id}`);
      } catch (error) {
        console.error(`Error processing prediction ${id}:`, error);
        throw error; // This will trigger a retry
      }
    });

    // Handle completed jobs
    PredictionQueue.queue.on("completed", (job) => {
      console.log(`Job ${job.id} completed for prediction ${job.data.id}`);
    });

    // Handle failed jobs
    PredictionQueue.queue.on("failed", (job, error) => {
      console.error(
        `Job ${job?.id} failed for prediction ${job?.data.id}:`,
        error
      );
    });
  }

  static async initialize() {
    if (this.instance) {
      return this.instance;
    }

    console.log("Initializing Redis connection...");
    console.log(
      `Connecting to Redis at ${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`
    );

    this.instance = new PredictionQueue();
    await this.queue.isReady();
    console.log("Successfully connected to Redis!");

    // Log initial queue state
    const stats = await this.queue.getJobCounts();
    console.log("Initial queue state:", {
      waiting: stats.waiting,
      active: stats.active,
      completed: stats.completed,
      failed: stats.failed,
      delayed: stats.delayed,
    });

    // If there are any jobs, log their details
    if (stats.waiting > 0 || stats.active > 0) {
      const jobs = await this.queue.getJobs(["waiting", "active"], 0, 10);
      console.log(
        "Current jobs in queue:",
        jobs.map((job) => ({
          id: job.id,
          data: job.data,
          timestamp: job.timestamp,
        }))
      );
    }

    return this.instance;
  }

  static async addPrediction(prediction: Prediction) {
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
        priceAtStart: prediction.priceAtStart || undefined, // Convert null to undefined
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
    return await this.queue.getJobCounts();
  }

  static async getFailedJobs() {
    const failedJobs = await this.queue.getFailed();
    return failedJobs.map((job) => ({
      id: job.data.id,
      tokenAddress: job.data.tokenAddress,
      error: job.failedReason,
      attempts: job.attemptsMade,
    }));
  }

  static async retryFailedJob(jobId: string) {
    const job = await this.queue.getJob(jobId);
    if (job) {
      await job.retry();
    }
  }
}
