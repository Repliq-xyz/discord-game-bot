import {
  SlashCommandBuilder,
  CommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  EmbedBuilder,
} from "discord.js";
import { Command } from "../types/Command";
import { tokens } from "../data/tokens";
import { PredictionService } from "../services/predictionService";
import { UserService } from "../services/userService";

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("token-prediction")
    .setDescription("Make a price prediction for a token")
    .addStringOption((option) =>
      option
        .setName("token")
        .setDescription("The token to predict")
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
    const user = await UserService.getOrCreateUser({
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

    // Create embed for token selection
    const tokenEmbed = new EmbedBuilder()
      .setColor("#0099ff")
      .setTitle("Token Selection")
      .setDescription(`You selected ${selectedToken.name}`)
      .addFields(
        {
          name: "Token Address",
          value: selectedToken.tokenAddress,
          inline: false,
        },
        { name: "Your Points", value: `${user.points}`, inline: true }
      )
      .setFooter({ text: "Choose your timeframe below" });

    // Send message with timeframe selection
    const response = await interaction.reply({
      embeds: [tokenEmbed],
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

      // Create embed for prediction
      const predictionEmbed = new EmbedBuilder()
        .setColor("#0099ff")
        .setTitle("Make Your Prediction")
        .setDescription(`Token: ${selectedToken.name}`)
        .addFields(
          { name: "Timeframe", value: timeframeLabel, inline: true },
          { name: "Your Points", value: `${user.points}`, inline: true }
        )
        .setFooter({ text: "Choose UP or DOWN for your prediction" });

      // Update message with buttons
      await i.update({
        embeds: [predictionEmbed],
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

            // Create success embed
            const successEmbed = new EmbedBuilder()
              .setColor("#00ff00")
              .setTitle("Prediction Registered!")
              .setDescription(`Your prediction has been saved successfully`)
              .addFields(
                { name: "Token", value: selectedToken.name, inline: true },
                { name: "Timeframe", value: timeframeLabel, inline: true },
                { name: "Direction", value: choice.toUpperCase(), inline: true }
              )
              .setFooter({ text: "Good luck!" });

            await buttonInteraction.update({
              embeds: [successEmbed],
              components: [],
            });
          } catch (error) {
            console.error("Error saving prediction:", error);

            // Create error embed
            const errorEmbed = new EmbedBuilder()
              .setColor("#ff0000")
              .setTitle("Error")
              .setDescription(
                "Failed to save your prediction. Please try again."
              )
              .setFooter({ text: "If the problem persists, contact support" });

            await buttonInteraction.update({
              embeds: [errorEmbed],
              components: [],
            });
          }
        }
      );

      buttonCollector.on("end", (collected) => {
        if (collected.size === 0) {
          const timeoutEmbed = new EmbedBuilder()
            .setColor("#ff9900")
            .setTitle("Time's Up!")
            .setDescription("No prediction was made within the time limit.")
            .setFooter({
              text: "Use the command again to make a new prediction",
            });

          interaction.editReply({
            embeds: [timeoutEmbed],
            components: [],
          });
        }
      });
    });

    timeframeCollector.on("end", (collected) => {
      if (collected.size === 0) {
        const timeoutEmbed = new EmbedBuilder()
          .setColor("#ff9900")
          .setTitle("Time's Up!")
          .setDescription("No timeframe was selected within the time limit.")
          .setFooter({
            text: "Use the command again to make a new prediction",
          });

        interaction.editReply({
          embeds: [timeoutEmbed],
          components: [],
        });
      }
    });
  },
};
