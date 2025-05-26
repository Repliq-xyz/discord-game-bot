import { Queue, Worker } from "bullmq";
import { TokenPredictionBattle } from "./tokenPredictionBattle";
import { client } from "../index";
import { TextChannel } from "discord.js";

interface BattleJob {
  battleId: string;
  type: "check_result" | "delete_unjoined";
}

export class BattleQueue {
  private static queue: Queue<BattleJob>;
  private static worker: Worker<BattleJob>;

  static async initialize() {
    if (!this.queue) {
      this.queue = new Queue<BattleJob>("battle-queue", {
        connection: {
          host: process.env.REDIS_HOST,
          port: parseInt(process.env.REDIS_PORT || "6379"),
        },
      });
    }

    if (!this.worker) {
      this.worker = new Worker<BattleJob>(
        "battle-queue",
        async (job) => {
          const { battleId, type } = job.data;

          if (type === "check_result") {
            const result = await TokenPredictionBattle.checkBattleResult(
              battleId
            );
            if (result) {
              const battleJob = await TokenPredictionBattle.getJob(battleId);
              if (battleJob) {
                const { battle } = await battleJob.finished();
                const channel = await client.channels.fetch(battle.channelId);
                if (channel?.isTextBased()) {
                  const textChannel = channel as TextChannel;
                  const message = await textChannel.messages.fetch(battleId);
                  if (message) {
                    const resultEmbed = {
                      color: 0x00ff00,
                      title: "Battle Result",
                      description: `Winner: <@${result.winner}>`,
                      fields: [
                        {
                          name: "Points Won",
                          value: result.points.toString(),
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
            const battleJob = await TokenPredictionBattle.getJob(battleId);
            if (battleJob) {
              const { battle } = await battleJob.finished();
              if (!battle.joined) {
                const channel = await client.channels.fetch(battle.channelId);
                if (channel?.isTextBased()) {
                  const textChannel = channel as TextChannel;
                  const message = await textChannel.messages.fetch(battleId);
                  if (message) {
                    await message.delete();
                  }
                }
                await TokenPredictionBattle.deleteBattle(battleId);
              }
            }
          }
        },
        {
          connection: {
            host: process.env.REDIS_HOST,
            port: parseInt(process.env.REDIS_PORT || "6379"),
          },
        }
      );

      this.worker.on("completed", (job) => {
        console.log(`Job ${job.id} completed for battle ${job.data.battleId}`);
      });

      this.worker.on("failed", (job, error) => {
        console.error(
          `Job ${job?.id} failed for battle ${job?.data.battleId}:`,
          error
        );
      });
    }
  }

  static async addBattleCheck(battleId: string, delay: number) {
    await this.initialize();
    await this.queue.add(
      "check_result",
      { battleId, type: "check_result" },
      { delay }
    );
  }

  static async addUnjoinedBattleDeletion(battleId: string, delay: number) {
    await this.initialize();
    await this.queue.add(
      "delete_unjoined",
      { battleId, type: "delete_unjoined" },
      { delay }
    );
  }
}
