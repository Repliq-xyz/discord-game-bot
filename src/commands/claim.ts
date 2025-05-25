import { SlashCommandBuilder, CommandInteraction } from "discord.js";
import { Command } from "../types/Command";
import { UserService } from "../services/userService";

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("claim")
    .setDescription("Claim your daily 20 points"),

  async execute(interaction: CommandInteraction) {
    try {
      // Ensure user exists
      await UserService.getOrCreateUser({
        id: interaction.user.id,
        username: interaction.user.username,
      });

      const result = await UserService.claimDailyPoints(interaction.user.id);

      if (result.success) {
        await interaction.reply({
          content: `✅ ${result.message}\nYou now have ${result.points} points!`,
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: `⏳ ${result.message}`,
          ephemeral: true,
        });
      }
    } catch (error) {
      console.error("Error in claim command:", error);
      await interaction.reply({
        content: "❌ An error occurred while claiming your points.",
        ephemeral: true,
      });
    }
  },
};
