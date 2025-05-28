import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
  TextChannel,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from "discord.js";
import { Command } from "../types/Command";
import { TokenPredictionBattle } from "../services/tokenPredictionBattle";
import { BattleQueue } from "../services/battleQueue";
import { tokens } from "../data/tokens";
import { UserService } from "../services/userService";
import { checkPrivateGamesChannel } from "../utils/channelCheck";

// Fonction utilitaire pour calculer le temps de fin
function calculateEndTime(startTime: number, timeframe: string): number {
  const value = parseInt(timeframe);
  const unit = timeframe.slice(-1); // 'm' for minutes, 'h' for hours, 'd' for days

  switch (unit) {
    case "m":
      return startTime + value * 60 * 1000;
    case "h":
      return startTime + value * 60 * 60 * 1000;
    case "d":
      return startTime + value * 24 * 60 * 60 * 1000;
    default:
      return startTime;
  }
}

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("tokenbattle")
    .setDescription("Create a token prediction battle")
    .addStringOption((option) =>
      option
        .setName("token")
        .setDescription("The token to predict")
        .setRequired(true)
        .addChoices(...TokenPredictionBattle.getAvailableTokens())
    )
    .addStringOption((option) =>
      option
        .setName("timeframe")
        .setDescription("The timeframe for the prediction")
        .setRequired(true)
        .addChoices(
          { name: "5min", value: "5m" },
          { name: "1h", value: "1h" },
          { name: "4h", value: "4h" },
          { name: "1d", value: "1d" }
        )
    )
    .addIntegerOption((option) =>
      option
        .setName("points")
        .setDescription("Points to bet (max 30)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(30)
    ),

  async execute(interaction: CommandInteraction) {
    try {
      // Vérifier si la commande est exécutée dans le bon canal
      if (!(await checkPrivateGamesChannel(interaction))) return;

      const token = interaction.options.get("token")?.value as string;
      const timeframe = interaction.options.get("timeframe")?.value as string;
      const points = interaction.options.get("points")?.value as number;

      if (!token || !timeframe || !points) {
        await interaction.reply({
          content: "Missing required options",
          ephemeral: true,
        });
        return;
      }

      if (points > 30) {
        await interaction.reply({
          content: "The maximum number of points you can bet is 30.",
          ephemeral: true,
        });
        return;
      }

      // Create battle embed
      const battleEmbed = new EmbedBuilder()
        .setColor("#0099ff")
        .setTitle("Token Prediction Battle")
        .setDescription(`A new battle has been created!`)
        .addFields(
          { name: "Creator", value: interaction.user.toString(), inline: true },
          {
            name: "Token",
            value: tokens.find((t) => t.tokenAddress === token)?.name || token,
            inline: true,
          },
          { name: "Timeframe", value: timeframe, inline: true },
          { name: "Points", value: points.toString(), inline: true }
        )
        .setTimestamp();

      // Create join button
      const joinButton = new ButtonBuilder()
        .setCustomId("join_battle")
        .setLabel("Join Battle")
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        joinButton
      );

      // Find battle channel
      const battleChannel = interaction.guild?.channels.cache.get(
        process.env.BATTLE_CHANNEL_ID as string
      ) as TextChannel;

      if (!battleChannel) {
        await interaction.reply({
          content:
            "Battle channel not found! Please check the BATTLE_CHANNEL_ID in your environment variables",
          ephemeral: true,
        });
        return;
      }

      // Send battle message
      const battleMessage = await battleChannel.send({
        embeds: [battleEmbed],
        components: [row],
      });

      // Initialize battle
      await TokenPredictionBattle.initializeBattle(
        battleMessage.id,
        battleChannel.id,
        interaction.user.id,
        token,
        timeframe,
        points
      );

      // Remove points from creator
      await UserService.updatePoints(interaction.user.id, -points);

      // Add jobs to queue
      await BattleQueue.addUnjoinedBattleDeletion(battleMessage.id, 60000); // 1 minute timeout

      await interaction.reply({
        content: `Battle created successfully! ${points} points have been deducted from your balance.`,
        ephemeral: true,
      });
    } catch (error: any) {
      console.error("Error creating token battle:", error);
      await interaction.reply({
        content: `Error creating battle: ${error.message}`,
        ephemeral: true,
      });
    }
  },
};
