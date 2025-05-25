import { SlashCommandBuilder, CommandInteraction } from "discord.js";
import { Command } from "../types/Command";
import { UserService } from "../services/userService";

interface LeaderboardUser {
  id: string;
  username: string;
  points: number;
}

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("points")
    .setDescription("View your points or the leaderboard")
    .addSubcommand((subcommand) =>
      subcommand.setName("me").setDescription("View your points")
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("leaderboard").setDescription("View the top players")
    ),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "me") {
      const points = await UserService.getUserPoints(interaction.user.id);
      await interaction.reply({
        content: `You have ${points} points!`,
        ephemeral: true,
      });
    } else if (subcommand === "leaderboard") {
      const leaderboard = await UserService.getLeaderboard();

      if (leaderboard.length === 0) {
        await interaction.reply({
          content: "No players yet!",
          ephemeral: true,
        });
        return;
      }

      const leaderboardText = leaderboard
        .map(
          (user: LeaderboardUser, index: number) =>
            `${index + 1}. ${user.username}: ${user.points} points`
        )
        .join("\n");

      await interaction.reply({
        content: `🏆 **Leaderboard** 🏆\n\n${leaderboardText}`,
        ephemeral: false,
      });
    }
  },
};
