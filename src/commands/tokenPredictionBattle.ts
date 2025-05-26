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

// Fonction utilitaire pour calculer le temps de fin
function calculateEndTime(startTime: number, timeframe: string): number {
  const hours = parseInt(timeframe);
  return startTime + hours * 60 * 60 * 1000;
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
          { name: "1h", value: "1h" },
          { name: "4h", value: "4h" },
          { name: "1d", value: "1d" }
        )
    )
    .addIntegerOption((option) =>
      option
        .setName("points")
        .setDescription("Points to bet")
        .setRequired(true)
        .setMinValue(1)
    ),

  async execute(interaction: CommandInteraction) {
    try {
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

      // Create battle embed
      const battleEmbed = new EmbedBuilder()
        .setColor("#0099ff")
        .setTitle("Token Prediction Battle")
        .setDescription(`A new battle has been created!`)
        .addFields(
          { name: "Creator", value: interaction.user.toString(), inline: true },
          { name: "Token", value: token, inline: true },
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

      // Add jobs to queue
      await BattleQueue.addUnjoinedBattleDeletion(battleMessage.id, 60000); // 1 minute timeout
      await BattleQueue.addBattleCheck(
        battleMessage.id,
        calculateEndTime(Date.now(), timeframe) - Date.now()
      );

      await interaction.reply({
        content: "Battle created successfully!",
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
