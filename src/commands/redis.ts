import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { Command } from "../types/Command";
import { PredictionQueue } from "../services/predictionQueue";

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("redis")
    .setDescription("Check Redis connection and queue status"),

  async execute(interaction: CommandInteraction) {
    try {
      // Initialize queue if not already initialized
      await PredictionQueue.initialize();

      // Get queue stats
      const stats = await PredictionQueue.getQueueStats();

      // Create embed with connection info and stats
      const embed = new EmbedBuilder()
        .setColor("#0099ff")
        .setTitle("Redis Connection Status")
        .addFields(
          {
            name: "Connection",
            value: "✅ Connected",
            inline: true,
          },
          {
            name: "Host",
            value: process.env.REDIS_HOST || "Not configured",
            inline: true,
          },
          {
            name: "Port",
            value: process.env.REDIS_PORT || "Not configured",
            inline: true,
          },
          {
            name: "Queue Stats",
            value: `Waiting: ${stats.waiting}\nActive: ${stats.active}\nCompleted: ${stats.completed}\nFailed: ${stats.failed}`,
            inline: false,
          }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error: any) {
      console.error("Error checking Redis connection:", error);

      const errorEmbed = new EmbedBuilder()
        .setColor("#ff0000")
        .setTitle("Redis Connection Error")
        .setDescription(`Failed to connect to Redis: ${error.message}`)
        .addFields(
          {
            name: "Host",
            value: process.env.REDIS_HOST || "Not configured",
            inline: true,
          },
          {
            name: "Port",
            value: process.env.REDIS_PORT || "Not configured",
            inline: true,
          }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  },
};
