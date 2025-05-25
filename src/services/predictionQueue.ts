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
    try {
      console.log("Creating new queue instance...");
      // Create a new queue
      PredictionQueue.queue = new Queue(
        "prediction-queue",
        process.env.REDIS_URL!,
        {
          defaultJobOptions: {
            attempts: 3,
            backoff: {
              type: "exponential",
              delay: 1000,
            },
            removeOnComplete: true,
            removeOnFail: false,
          },
          redis: {
            tls: {}, // Enable TLS for Railway Redis
          },
        }
      );

      console.log("Queue instance created, setting up processors...");

      // Process jobs
      PredictionQueue.queue.process(async (job) => {
        console.log(`Processing job ${job.id} for prediction ${job.data.id}`);
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

      // Handle stalled jobs
      PredictionQueue.queue.on("stalled", (job) => {
        console.warn(`Job ${job.id} stalled for prediction ${job.data.id}`);
      });

      // Handle error events
      PredictionQueue.queue.on("error", (error) => {
        console.error("Queue error:", error);
      });

      console.log("Queue processors set up successfully");
    } catch (error) {
      console.error("Error creating queue instance:", error);
      throw error;
    }
  }

  static async initialize() {
    if (this.instance) {
      return this.instance;
    }

    console.log("Initializing Redis connection...");
    console.log(`Connecting to Redis at ${process.env.REDIS_URL}`);

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
    try {
      // Ensure queue is initialized
      if (!this.queue) {
        console.log("Queue not initialized, initializing now...");
        await this.initialize();
      }

      // Ensure queue is ready
      if (!this.queue.isReady()) {
        console.log("Waiting for queue to be ready...");
        await this.queue.isReady();
        console.log("Queue is now ready");
      }

      // Calculate delay until expiration
      const delay = prediction.expiresAt.getTime() - Date.now();
      console.log("Calculated delay for prediction:", {
        predictionId: prediction.id,
        delay,
        expiresAt: prediction.expiresAt,
        now: new Date(),
      });

      if (delay < 0) {
        console.warn(`Prediction ${prediction.id} has already expired`);
        return;
      }

      // Add job to queue with delay
      const job = await this.queue.add(
        {
          id: prediction.id,
          tokenAddress: prediction.tokenAddress,
          expiresAt: prediction.expiresAt,
          priceAtStart: prediction.priceAtStart || undefined,
        },
        {
          delay,
          jobId: prediction.id, // Use prediction ID as job ID to prevent duplicates
        }
      );

      console.log(
        `Added prediction ${prediction.id} to queue with delay ${delay}ms. Job ID: ${job.id}`
      );

      // Verify job was added
      const jobCounts = await this.queue.getJobCounts();
      console.log("Current queue state after adding job:", jobCounts);

      return job;
    } catch (error) {
      console.error("Error adding prediction to queue:", {
        predictionId: prediction.id,
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error; // Re-throw to be handled by the caller
    }
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
