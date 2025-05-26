import { Queue } from "bullmq";
import { TokenService } from "./tokenService";
import { tokens } from "../data/tokens";
import { client } from "../index";
import { TextChannel } from "discord.js";

interface Battle {
  id: string;
  channelId: string;
  creatorId: string;
  creatorToken: string;
  joined: boolean;
  joinerId?: string;
  joinerToken?: string;
  timeframe: string;
  points: number;
  startTime: number;
  endTime: number;
}

interface BattlePrices {
  creatorTokenPrice: number;
  joinerTokenPrice: number;
}

export class TokenPredictionBattle {
  private static queue: Queue;
  private static readonly BATTLE_PREFIX = "battle:";
  private static instance: TokenPredictionBattle | null = null;

  private constructor() {
    try {
      console.log("Creating new battle storage queue instance...");

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
      TokenPredictionBattle.queue = new Queue("battle-storage", {
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

      console.log("Battle storage queue instance created successfully");
    } catch (error) {
      console.error("Error creating battle storage queue instance:", error);
      throw error;
    }
  }

  static async initialize() {
    if (this.instance) {
      return this.instance;
    }

    console.log("Initializing Redis connection for battle storage...");
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    const url = new URL(redisUrl);
    console.log(`Connecting to Redis at ${url.hostname}:${url.port}`);

    this.instance = new TokenPredictionBattle();
    await this.queue.waitUntilReady();
    console.log("Successfully connected to Redis for battle storage!");

    return this.instance;
  }

  static async getJob(battleId: string) {
    await this.initialize();
    return this.queue.getJob(`${this.BATTLE_PREFIX}${battleId}`);
  }

  static async initializeBattle(
    battleId: string,
    channelId: string,
    creatorId: string,
    token: string,
    timeframe: string,
    points: number
  ): Promise<void> {
    await this.initialize();

    const startTime = Date.now();
    const endTime = this.calculateEndTime(startTime, timeframe);

    const battle: Battle = {
      id: battleId,
      channelId,
      creatorId,
      creatorToken: token,
      joined: false,
      timeframe,
      points,
      startTime,
      endTime,
    };

    await this.queue.add(
      "store_battle",
      { battle },
      { jobId: `${this.BATTLE_PREFIX}${battleId}` }
    );
  }

  static async joinBattle(
    battleId: string,
    joinerId: string,
    token: string
  ): Promise<void> {
    console.log(
      `Attempting to join battle ${battleId} for user ${joinerId} with token ${token}`
    );
    await this.initialize();

    const battle = await this.getBattle(battleId);
    console.log("Current battle state:", battle);
    if (!battle) {
      throw new Error("Battle not found");
    }

    if (battle.joined) {
      throw new Error("Battle already has a joiner");
    }

    console.log("Getting token prices...");
    // Get prices when someone joins
    const prices = await this.getTokenPrices(battle.creatorToken, token);
    console.log("Token prices:", prices);

    // Update battle state
    const updatedBattle = {
      ...battle,
      joined: true,
      joinerId: joinerId,
      joinerToken: token,
    };

    console.log("Updating battle state with:", updatedBattle);

    // Remove existing job first
    const existingJob = await this.queue.getJob(
      `${this.BATTLE_PREFIX}${battleId}`
    );
    if (existingJob) {
      await existingJob.remove();
    }

    // Store updated battle with prices
    await this.queue.add(
      "update_battle",
      {
        battle: updatedBattle,
        prices,
        startTime: Date.now(),
      },
      {
        jobId: `${this.BATTLE_PREFIX}${battleId}`,
        removeOnComplete: false, // Keep the job in Redis
      }
    );

    console.log("Verifying battle update...");
    // Verify the update was successful
    const finalBattle = await this.getBattle(battleId);
    console.log("Updated battle state:", finalBattle);
    if (!finalBattle || !finalBattle.joined) {
      console.error("Battle update verification failed:", {
        finalBattle,
        expectedJoined: true,
        actualJoined: finalBattle?.joined,
      });
      throw new Error("Failed to update battle state");
    }
    console.log("Battle update successful!");
  }

  private static async getTokenPrices(
    creatorToken: string,
    joinerToken: string
  ): Promise<BattlePrices> {
    const [creatorTokenPrice, joinerTokenPrice] = await Promise.all([
      TokenService.getTokenPrice(creatorToken),
      TokenService.getTokenPrice(joinerToken),
    ]);

    return {
      creatorTokenPrice,
      joinerTokenPrice,
    };
  }

  static async getBattle(battleId: string): Promise<Battle | null> {
    await this.initialize();

    const job = await this.queue.getJob(`${this.BATTLE_PREFIX}${battleId}`);
    if (!job) return null;

    console.log("Job state:", await job.getState());
    console.log("Job data:", job.data);

    // Always return the battle data from job.data
    return job.data.battle;
  }

  static async deleteBattle(battleId: string): Promise<void> {
    await this.initialize();
    const job = await this.queue.getJob(`${this.BATTLE_PREFIX}${battleId}`);
    if (job) {
      await job.remove();
    }
  }

  static async checkBattleResult(battleId: string): Promise<{
    winner: string;
    loser: string;
    points: number;
  } | null> {
    console.log(`Starting checkBattleResult for battle ${battleId}`);
    const job = await this.queue.getJob(`${this.BATTLE_PREFIX}${battleId}`);
    if (!job) {
      console.log("No job found for battle:", battleId);
      return null;
    }

    const { battle, prices, startTime } = job.data;
    console.log("Battle data:", {
      battle,
      prices,
      startTime,
    });

    if (!battle.joined || !battle.joinerToken) {
      console.log("Battle not joined or missing joiner token:", {
        joined: battle.joined,
        hasJoinerToken: !!battle.joinerToken,
      });
      return null;
    }

    const now = Date.now();
    console.log("Time check:", {
      now,
      endTime: battle.endTime,
      isEnded: now >= battle.endTime,
    });

    if (now < battle.endTime) {
      console.log("Battle not ended yet");
      return null;
    }

    console.log("Getting final token prices...");
    // Get final prices
    const finalPrices = await this.getTokenPrices(
      battle.creatorToken,
      battle.joinerToken
    );
    console.log("Final prices:", finalPrices);

    const creatorPerformance =
      ((finalPrices.creatorTokenPrice - prices.creatorTokenPrice) /
        prices.creatorTokenPrice) *
      100;
    const joinerPerformance =
      ((finalPrices.joinerTokenPrice - prices.joinerTokenPrice) /
        prices.joinerTokenPrice) *
      100;

    console.log("Performance calculations:", {
      creatorPerformance,
      joinerPerformance,
      creatorStartPrice: prices.creatorTokenPrice,
      creatorEndPrice: finalPrices.creatorTokenPrice,
      joinerStartPrice: prices.joinerTokenPrice,
      joinerEndPrice: finalPrices.joinerTokenPrice,
    });

    let result = null;
    if (creatorPerformance > joinerPerformance) {
      result = {
        winner: battle.creatorId,
        loser: battle.joinerId!,
        points: battle.points,
      };
      console.log("Creator won:", result);
    } else if (joinerPerformance > creatorPerformance) {
      result = {
        winner: battle.joinerId!,
        loser: battle.creatorId,
        points: battle.points,
      };
      console.log("Joiner won:", result);
    } else {
      console.log("Battle ended in a tie");
    }

    if (result) {
      console.log("Sending result to feed channel...");
      // Send result to feed
      const feedChannel = await client.channels.fetch(
        process.env.FEED_CHANNEL_ID || ""
      );
      if (feedChannel?.isTextBased()) {
        const textChannel = feedChannel as TextChannel;
        const feedEmbed = {
          color: 0x00ff00,
          title: "Battle Result",
          description: `Battle between <@${battle.creatorId}> and <@${battle.joinerId}> has ended!`,
          fields: [
            {
              name: "Winner",
              value: `<@${result.winner}>`,
              inline: true,
            },
            {
              name: "Points Won",
              value: (result.points * 2).toString(),
              inline: true,
            },
            {
              name: "Loser",
              value: `<@${result.loser}>`,
              inline: true,
            },
            {
              name: "Creator's Token Performance",
              value: `${creatorPerformance.toFixed(2)}%`,
              inline: true,
            },
            {
              name: "Joiner's Token Performance",
              value: `${joinerPerformance.toFixed(2)}%`,
              inline: true,
            },
          ],
          timestamp: new Date().toISOString(),
        };

        await textChannel.send({ embeds: [feedEmbed] });
        console.log("Result sent to feed channel");
      } else {
        console.log("Feed channel not found or not text-based");
      }
    }

    console.log("checkBattleResult completed with result:", result);
    return result;
  }

  private static calculateEndTime(
    startTime: number,
    timeframe: string
  ): number {
    const hours = parseInt(timeframe);
    return startTime + hours * 60 * 60 * 1000;
  }

  static getAvailableTokens() {
    return tokens.map((token) => ({
      name: token.name,
      value: token.tokenAddress,
      inline: true,
    }));
  }

  static async close() {
    if (this.queue) {
      await this.queue.close();
    }
  }
}
