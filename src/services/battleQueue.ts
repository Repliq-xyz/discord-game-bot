import { Queue, Worker } from "bullmq";
import { TokenPredictionBattle } from "./tokenPredictionBattle";
import { client } from "../index";
import { TextChannel } from "discord.js";
import { UserService } from "./userService";

interface BattleJob {
  battleId: string;
  type: "check_result" | "delete_unjoined";
}

export class BattleQueue {
  private static queue: Queue<BattleJob>;
  private static worker: Worker<BattleJob>;
  private static instance: BattleQueue | null = null;

  private constructor() {
    try {
      console.log("Creating new battle queue instance...");

      // Parse Redis URL
      const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
      const url = new URL(redisUrl);
      console.log(`Parsed Redis URL: ${url.hostname}:${url.port}`);

      const connectionConfig = {
        family: 0,
        host: url.hostname,
        port: Number(url.port),
        username: url.username || undefined,
        password: url.password || undefined,
      };

      console.log("Redis connection config:", {
        host: connectionConfig.host,
        port: connectionConfig.port,
        hasUsername: !!connectionConfig.username,
        hasPassword: !!connectionConfig.password,
      });

      // Create a new queue
      BattleQueue.queue = new Queue<BattleJob>("battle-queue", {
        connection: connectionConfig,
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

      console.log("Battle queue instance created, setting up worker...");

      // Create worker to process jobs
      BattleQueue.worker = new Worker<BattleJob>(
        "battle-queue",
        async (job) => {
          const { battleId, type } = job.data;

          console.log("Battle type:", type);

          if (type === "check_result") {
            console.log("Checking battle result...");
            const result = await TokenPredictionBattle.checkBattleResult(
              battleId
            );
            console.log("Battle result:", result);
            if (result) {
              console.log("Battle result:", result);
              const battleJob = await TokenPredictionBattle.getJob(battleId);
              if (battleJob) {
                const battle = battleJob.data.battle;
                const channel = await client.channels.fetch(battle.channelId);
                if (channel?.isTextBased()) {
                  const textChannel = channel as TextChannel;
                  const message = await textChannel.messages.fetch(battleId);
                  if (message) {
                    // Give points to winner
                    await UserService.updatePoints(
                      result.winner,
                      battle.points * 1.5
                    );

                    const resultEmbed = {
                      color: 0x00ff00,
                      title: "Battle Result",
                      description: `Winner: <@${result.winner}>`,
                      fields: [
                        {
                          name: "Points Won",
                          value: (battle.points * 1.5).toString(),
                          inline: true,
                        },
                        {
                          name: "Loser",
                          value: `<@${result.loser}>`,
                          inline: true,
                        },
                      ],
                      timestamp: new Date().toISOString(),
                    };

                    await message.edit({
                      embeds: [resultEmbed],
                      components: [],
                    });
                  }
                }
              }
            }
          } else if (type === "delete_unjoined") {
            console.log("Checking if battle should be deleted...");
            const battleJob = await TokenPredictionBattle.getJob(battleId);
            if (battleJob) {
              console.log(
                "Battle job data:",
                JSON.stringify(battleJob.data, null, 2)
              );
              const battle = battleJob.data.battle;
              console.log("Battle state:", battle);
              // Only delete if the battle hasn't been joined
              if (!battle.joined) {
                console.log("Battle not joined, proceeding with deletion...");
                // Return points to creator if no one joined
                await UserService.updatePoints(battle.creatorId, battle.points);

                const channel = await client.channels.fetch(battle.channelId);
                if (channel?.isTextBased()) {
                  const textChannel = channel as TextChannel;
                  const message = await textChannel.messages.fetch(battleId);
                  if (message) {
                    await message.delete();
                  }
                }
                await TokenPredictionBattle.deleteBattle(battleId);
              } else {
                console.log("Battle has been joined, skipping deletion...");
              }
            } else {
              console.log("No battle job found for ID:", battleId);
            }
          }
        },
        {
          connection: connectionConfig,
        }
      );

      // Handle completed jobs
      BattleQueue.worker.on("completed", (job) => {
        console.log(`Job ${job.id} completed for battle ${job.data.battleId}`);
      });

      // Handle failed jobs
      BattleQueue.worker.on("failed", (job, error) => {
        console.error(
          `Job ${job?.id} failed for battle ${job?.data.battleId}:`,
          error
        );
      });

      // Handle stalled jobs
      BattleQueue.worker.on("stalled", (jobId: string, prev: string) => {
        console.warn(`Job ${jobId} stalled for battle ${prev}`);
      });

      // Handle error events
      BattleQueue.worker.on("error", (error: Error) => {
        console.error("Worker error:", error);
      });

      BattleQueue.queue.on("error", (error: Error) => {
        console.error("Queue error:", error);
      });

      console.log("Battle worker set up successfully");
    } catch (error) {
      console.error("Error creating battle queue instance:", error);
      throw error;
    }
  }

  static async initialize() {
    if (this.instance) {
      return this.instance;
    }

    console.log("Initializing Redis connection for battle queue...");
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    const url = new URL(redisUrl);
    console.log(`Connecting to Redis at ${url.hostname}:${url.port}`);

    this.instance = new BattleQueue();
    await this.queue.waitUntilReady();
    console.log("Successfully connected to Redis for battle queue!");

    // Log initial queue state
    const stats = await this.queue.getJobCounts();
    console.log("Initial battle queue state:", {
      waiting: stats.waiting,
      active: stats.active,
      completed: stats.completed,
      failed: stats.failed,
      delayed: stats.delayed,
    });

    return this.instance;
  }

  static async addBattleCheck(battleId: string, delay: number) {
    try {
      // Ensure queue is initialized
      if (!this.queue) {
        console.log("Battle queue not initialized, initializing now...");
        await this.initialize();
      }

      // Ensure queue is ready
      await this.queue.waitUntilReady();
      console.log("Battle queue is now ready");

      // Add job to queue with delay
      const job = await this.queue.add(
        "check_result",
        { battleId, type: "check_result" },
        { delay }
      );

      console.log(
        `Added battle check for ${battleId} to queue with delay ${delay}ms. Job ID: ${job.id}`
      );

      return job;
    } catch (error) {
      console.error("Error adding battle check to queue:", {
        battleId,
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  static async addUnjoinedBattleDeletion(battleId: string, delay: number) {
    try {
      // Ensure queue is initialized
      if (!this.queue) {
        console.log("Battle queue not initialized, initializing now...");
        await this.initialize();
      }

      // Ensure queue is ready
      await this.queue.waitUntilReady();
      console.log("Battle queue is now ready");

      // Add job to queue with delay
      const job = await this.queue.add(
        "delete_unjoined",
        { battleId, type: "delete_unjoined" },
        { delay }
      );

      console.log(
        `Added unjoined battle deletion for ${battleId} to queue with delay ${delay}ms. Job ID: ${job.id}`
      );

      return job;
    } catch (error) {
      console.error("Error adding unjoined battle deletion to queue:", {
        battleId,
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  static async getQueueStats() {
    return await this.queue.getJobCounts();
  }

  static async close() {
    if (this.worker) {
      await this.worker.close();
    }
    if (this.queue) {
      await this.queue.close();
    }
  }

  static async cleanAllJobs() {
    try {
      if (!this.queue) {
        await this.initialize();
      }

      console.log("Cleaning all jobs from battle queue...");

      // Get all jobs
      const jobs = await this.queue.getJobs([
        "active",
        "waiting",
        "delayed",
        "failed",
        "completed",
      ]);
      console.log(`Found ${jobs.length} jobs to clean`);

      // Remove all jobs
      for (const job of jobs) {
        await job.remove();
      }

      console.log("Successfully cleaned all jobs from battle queue");
    } catch (error) {
      console.error("Error cleaning jobs:", error);
      throw error;
    }
  }
}
