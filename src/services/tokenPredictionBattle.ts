import { Queue } from "bullmq";
import { TokenService } from "./tokenService";
import { tokens } from "../data/tokens";

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

  static async initialize() {
    if (!this.queue) {
      this.queue = new Queue("battle-storage", {
        connection: {
          host: process.env.REDIS_HOST,
          port: parseInt(process.env.REDIS_PORT || "6379"),
        },
      });
    }
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
    await this.initialize();

    const battle = await this.getBattle(battleId);
    if (!battle) {
      throw new Error("Battle not found");
    }

    if (battle.joined) {
      throw new Error("Battle already has a joiner");
    }

    // Get prices when someone joins
    const prices = await this.getTokenPrices(battle.creatorToken, token);

    battle.joined = true;
    battle.joinerId = joinerId;
    battle.joinerToken = token;

    // Store battle with prices
    await this.queue.add(
      "update_battle",
      {
        battle,
        prices,
        startTime: Date.now(),
      },
      { jobId: `${this.BATTLE_PREFIX}${battleId}` }
    );
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

    const data = await job.getState();
    if (data === "completed") {
      const result = await job.finished();
      return result.battle;
    }

    return null;
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
    const job = await this.queue.getJob(`${this.BATTLE_PREFIX}${battleId}`);
    if (!job) return null;

    const result = await job.finished();
    const { battle, prices, startTime } = result;

    if (!battle.joined || !battle.joinerToken) {
      return null;
    }

    const now = Date.now();
    if (now < battle.endTime) {
      return null;
    }

    // Get final prices
    const finalPrices = await this.getTokenPrices(
      battle.creatorToken,
      battle.joinerToken
    );

    const creatorPerformance =
      ((finalPrices.creatorTokenPrice - prices.creatorTokenPrice) /
        prices.creatorTokenPrice) *
      100;
    const joinerPerformance =
      ((finalPrices.joinerTokenPrice - prices.joinerTokenPrice) /
        prices.joinerTokenPrice) *
      100;

    if (creatorPerformance > joinerPerformance) {
      return {
        winner: battle.creatorId,
        loser: battle.joinerId!,
        points: battle.points,
      };
    } else if (joinerPerformance > creatorPerformance) {
      return {
        winner: battle.joinerId!,
        loser: battle.creatorId,
        points: battle.points,
      };
    }

    return null; // Draw
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
    }));
  }
}
