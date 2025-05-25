import { Prediction } from "../types/Prediction";
import { TokenService } from "./tokenService";
import { PredictionService } from "./predictionService";
import { Queue, Worker, Job, Job as BullMQJob } from "bullmq";

interface PredictionJob {
  id: string;
  tokenAddress: string;
  priceAtStart?: number;
  expiresAt: Date;
}

export class PredictionQueue {
  private static queue: Queue<PredictionJob>;
  private static worker: Worker<PredictionJob>;
  private static instance: PredictionQueue | null = null;

  private constructor() {
    try {
      console.log("Creating new queue instance...");
      // Create a new queue
      PredictionQueue.queue = new Queue<PredictionJob>("prediction-queue", {
        connection: {
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

      console.log("Queue instance created, setting up worker...");

      // Create worker to process jobs
      PredictionQueue.worker = new Worker<PredictionJob>(
        "prediction-queue",
        async (job: Job<PredictionJob>) => {
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
        },
        {
          connection: {
            host: process.env.REDIS_HOST,
            port: parseInt(process.env.REDIS_PORT || "6379"),
            password: process.env.REDIS_PASSWORD,
            tls: {}, // Enable TLS for Railway Redis
          },
        }
      );

      // Handle completed jobs
      PredictionQueue.worker.on(
        "completed",
        (job: Job<PredictionJob>, result: any) => {
          console.log(`Job ${job.id} completed for prediction ${job.data.id}`);
        }
      );

      // Handle failed jobs
      PredictionQueue.worker.on(
        "failed",
        (job: Job<PredictionJob> | undefined, error: Error) => {
          console.error(
            `Job ${job?.id} failed for prediction ${job?.data.id}:`,
            error
          );
        }
      );

      // Handle stalled jobs
      PredictionQueue.worker.on("stalled", (jobId: string, prev: string) => {
        console.warn(`Job ${jobId} stalled for prediction ${prev}`);
      });

      // Handle error events
      PredictionQueue.worker.on("error", (error: Error) => {
        console.error("Worker error:", error);
      });

      PredictionQueue.queue.on("error", (error: Error) => {
        console.error("Queue error:", error);
      });

      console.log("Worker set up successfully");
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
    console.log(
      `Connecting to Redis at ${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`
    );

    this.instance = new PredictionQueue();
    await this.queue.waitUntilReady();
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
        jobs.map((job: BullMQJob<PredictionJob>) => ({
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
      await this.queue.waitUntilReady();
      console.log("Queue is now ready");

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
        prediction.id, // Use prediction ID as job ID to prevent duplicates
        {
          id: prediction.id,
          tokenAddress: prediction.tokenAddress,
          expiresAt: prediction.expiresAt,
          priceAtStart: prediction.priceAtStart || undefined,
        },
        {
          delay,
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
    return failedJobs.map((job: BullMQJob<PredictionJob>) => ({
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

  static async close() {
    if (this.worker) {
      await this.worker.close();
    }
    if (this.queue) {
      await this.queue.close();
    }
  }
}
