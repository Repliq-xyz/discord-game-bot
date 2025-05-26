import { SlashCommandBuilder, CommandInteraction } from "discord.js";
import { Command } from "../types/Command";
import { BattleQueue } from "../services/battleQueue";

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("cleanqueue")
    .setDescription("Clean all jobs from the battle queue"),

  async execute(interaction: CommandInteraction) {
    try {
      // Check if user has admin permissions
      if (!interaction.memberPermissions?.has("Administrator")) {
        await interaction.reply({
          content: "You don't have permission to use this command.",
          ephemeral: true,
        });
        return;
      }

      await interaction.deferReply({ ephemeral: true });

      await BattleQueue.cleanAllJobs();

      await interaction.editReply({
        content: "Successfully cleaned all jobs from the battle queue!",
      });
    } catch (error: any) {
      console.error("Error cleaning queue:", error);
      await interaction.editReply({
        content: `Error cleaning queue: ${error.message}`,
      });
    }
  },
};
