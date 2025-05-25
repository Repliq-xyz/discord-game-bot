import {
  SlashCommandBuilder,
  CommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
} from "discord.js";
import { Command } from "../types/Command";
import { tokens } from "../data/tokens";
import { PredictionService } from "../services/predictionService";
import { UserService } from "../services/userService";

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("select-token")
    .setDescription("Select a token for the game")
    .addStringOption((option) =>
      option
        .setName("token")
        .setDescription("The token to select")
        .setRequired(true)
        .addChoices(
          ...tokens.map((token) => ({
            name: token.name,
            value: token.tokenAddress,
          }))
        )
    ),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;

    // Create or update user
    await UserService.getOrCreateUser({
      id: interaction.user.id,
      username: interaction.user.username,
    });

    const selectedTokenAddress = interaction.options.getString("token");
    if (!selectedTokenAddress) {
      await interaction.reply({
        content: "Please select a token!",
        ephemeral: true,
      });
      return;
    }

    const selectedToken = tokens.find(
      (token) => token.tokenAddress === selectedTokenAddress
    );

    if (!selectedToken) {
      await interaction.reply({
        content: "Token not found!",
        ephemeral: true,
      });
      return;
    }

    // Create timeframe selection menu
    const timeframeRow =
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("timeframe")
          .setPlaceholder("Choose a timeframe")
          .addOptions([
            {
              label: "1 Minute",
              description: "Prediction for 1 minute",
              value: "1m",
            },
            {
              label: "1 Hour",
              description: "Prediction for 1 hour",
              value: "1h",
            },
            {
              label: "1 Day",
              description: "Prediction for 1 day",
              value: "1d",
            },
          ])
      );

    // Send message with timeframe selection
    const response = await interaction.reply({
      content: `You selected token ${selectedToken.name} (${selectedToken.tokenAddress}).\nChoose your timeframe:`,
      components: [timeframeRow],
      ephemeral: true,
    });

    // Create collector for timeframe selection
    const timeframeCollector = response.createMessageComponentCollector({
      time: 60000,
      filter: (i) => i.isStringSelectMenu() && i.customId === "timeframe",
    });

    timeframeCollector.on("collect", async (i: StringSelectMenuInteraction) => {
      if (i.user.id !== interaction.user.id) {
        await i.reply({ content: "It's not your turn!", ephemeral: true });
        return;
      }

      const timeframe = i.values[0];
      let timeframeLabel = "";
      switch (timeframe) {
        case "1m":
          timeframeLabel = "1 minute";
          break;
        case "1h":
          timeframeLabel = "1 hour";
          break;
        case "1d":
          timeframeLabel = "1 day";
          break;
      }

      // Create Up and Down buttons
      const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("up")
          .setLabel("UP")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("down")
          .setLabel("DOWN")
          .setStyle(ButtonStyle.Danger)
      );

      // Update message with buttons
      await i.update({
        content: `Token: ${selectedToken.name}\nTimeframe: ${timeframeLabel}\nChoose your prediction:`,
        components: [buttonRow],
      });

      // Create collector for buttons
      const buttonCollector = response.createMessageComponentCollector({
        time: 60000,
        filter: (i) =>
          i.isButton() && (i.customId === "up" || i.customId === "down"),
      });

      buttonCollector.on(
        "collect",
        async (buttonInteraction: ButtonInteraction) => {
          if (buttonInteraction.user.id !== interaction.user.id) {
            await buttonInteraction.reply({
              content: "It's not your turn!",
              ephemeral: true,
            });
            return;
          }

          const choice = buttonInteraction.customId;

          try {
            // Save prediction to database
            await PredictionService.createPrediction({
              userId: interaction.user.id,
              tokenAddress: selectedToken.tokenAddress,
              tokenName: selectedToken.name,
              timeframe,
              direction: choice.toUpperCase(),
            });

            await buttonInteraction.update({
              content: `Prediction registered!\nToken: ${
                selectedToken.name
              }\nTimeframe: ${timeframeLabel}\nDirection: ${choice.toUpperCase()}`,
              components: [],
            });
          } catch (error) {
            console.error("Error saving prediction:", error);
            await buttonInteraction.update({
              content: "Error saving your prediction. Please try again.",
              components: [],
            });
          }
        }
      );

      buttonCollector.on("end", (collected) => {
        if (collected.size === 0) {
          interaction.editReply({
            content: "Time's up! No prediction was made.",
            components: [],
          });
        }
      });
    });

    timeframeCollector.on("end", (collected) => {
      if (collected.size === 0) {
        interaction.editReply({
          content: "Time's up! No timeframe was selected.",
          components: [],
        });
      }
    });
  },
};
