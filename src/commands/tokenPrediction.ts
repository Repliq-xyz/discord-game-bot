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
  TextChannel,
} from "discord.js";
import { Command } from "../types/Command";
import { tokens } from "../data/tokens";
import { PredictionService } from "../services/predictionService";
import { UserService } from "../services/userService";
import { checkPrivateGamesChannel } from "../utils/channelCheck";

const timeframes = {
  "5m": 5 * 60 * 1000, // 5 minutes en millisecondes
  "1h": 60 * 60 * 1000, // 1 heure en millisecondes
  "1d": 24 * 60 * 60 * 1000, // 1 jour en millisecondes
};

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

    // Vérifier si la commande est exécutée dans le bon canal
    if (!(await checkPrivateGamesChannel(interaction))) return;

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
              label: "5 Minutes",
              description: "Prediction for 5 minutes",
              value: "5m",
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
      let maxPoints = 0;
      switch (timeframe) {
        case "5m":
          timeframeLabel = "5 minutes";
          maxPoints = 100;
          break;
        case "1h":
          timeframeLabel = "1 hour";
          maxPoints = 500;
          break;
        case "1d":
          timeframeLabel = "1 day";
          maxPoints = 1000;
          break;
      }

      // Stop the timeframe collector before proceeding
      timeframeCollector.stop();

      // Create points input row
      const pointsRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("points_5")
          .setLabel("5 Points")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("points_10")
          .setLabel("10 Points")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("points_50")
          .setLabel("50 Points")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("points_100")
          .setLabel("100 Points")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("points_max")
          .setLabel(`Max (${maxPoints})`)
          .setStyle(ButtonStyle.Primary)
      );

      // Create embed for points selection
      const pointsEmbed = new EmbedBuilder()
        .setColor("#0099ff")
        .setTitle("Select Points to Wager")
        .setDescription(`Token: ${selectedToken.name}`)
        .addFields(
          { name: "Timeframe", value: timeframeLabel, inline: true },
          { name: "Your Points", value: `${user.points}`, inline: true },
          { name: "Maximum Wager", value: `${maxPoints} points`, inline: true }
        )
        .setFooter({ text: "Choose how many points to wager" });

      // Update message with points selection
      await i.update({
        embeds: [pointsEmbed],
        components: [pointsRow],
      });

      // Create collector for points selection
      const pointsCollector = response.createMessageComponentCollector({
        time: 60000,
        filter: (i) => i.isButton() && i.customId.startsWith("points_"),
      });

      pointsCollector.on(
        "collect",
        async (pointsInteraction: ButtonInteraction) => {
          if (pointsInteraction.user.id !== interaction.user.id) {
            if (!pointsInteraction.replied && !pointsInteraction.deferred) {
              await pointsInteraction.reply({
                content: "It's not your turn!",
                ephemeral: true,
              });
            }
            return;
          }

          let pointsToWager = 0;
          switch (pointsInteraction.customId) {
            case "points_5":
              pointsToWager = 5;
              break;
            case "points_10":
              pointsToWager = 10;
              break;
            case "points_50":
              pointsToWager = 50;
              break;
            case "points_100":
              pointsToWager = 100;
              break;
            case "points_max":
              pointsToWager = maxPoints;
              break;
          }

          console.log("Points to wager:", pointsToWager);
          console.log("User points:", user.points);

          // Check if user has enough points
          if (user.points < pointsToWager) {
            console.log("User doesn't have enough points");
            if (!pointsInteraction.replied && !pointsInteraction.deferred) {
              await pointsInteraction.reply({
                content: "You don't have enough points!",
                ephemeral: true,
              });
            }
            return;
          }

          try {
            // Stop the points collector before creating the new one
            pointsCollector.stop();

            // Create Up and Down buttons
            const buttonRow =
              new ActionRowBuilder<ButtonBuilder>().addComponents(
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
                {
                  name: "Points Wagered",
                  value: `${pointsToWager}`,
                  inline: true,
                },
                { name: "Your Points", value: `${user.points}`, inline: true }
              )
              .setFooter({ text: "Choose UP or DOWN for your prediction" });

            console.log("Updating message with prediction buttons");

            // Update the message with the new buttons
            try {
              await pointsInteraction.update({
                embeds: [predictionEmbed],
                components: [buttonRow],
              });
            } catch (updateError) {
              console.error(
                "Error updating message with prediction buttons:",
                updateError
              );
              return;
            }

            // Create collector for buttons with increased timeout
            const buttonCollector = response.createMessageComponentCollector({
              time: 120000, // 2 minutes timeout
              filter: (i) =>
                i.isButton() && (i.customId === "up" || i.customId === "down"),
            });

            buttonCollector.on(
              "collect",
              async (buttonInteraction: ButtonInteraction) => {
                if (buttonInteraction.user.id !== interaction.user.id) {
                  if (
                    !buttonInteraction.replied &&
                    !buttonInteraction.deferred
                  ) {
                    await buttonInteraction.reply({
                      content: "It's not your turn!",
                      ephemeral: true,
                    });
                  }
                  return;
                }

                // Stop the collector immediately to prevent multiple responses
                buttonCollector.stop();

                const choice = buttonInteraction.customId;

                try {
                  // Calculate expiration date based on timeframe
                  const expiresAt = new Date(
                    Date.now() +
                      timeframes[timeframe as keyof typeof timeframes]
                  );
                  console.log(
                    "Creating prediction with expiration:",
                    expiresAt
                  );

                  // Create prediction first
                  const prediction = await PredictionService.createPrediction({
                    userId: interaction.user.id,
                    tokenAddress: selectedToken.tokenAddress,
                    tokenName: selectedToken.name,
                    timeframe,
                    direction: choice.toUpperCase() as "UP" | "DOWN",
                    expiresAt,
                    pointsWagered: pointsToWager,
                  });

                  console.log("Prediction created successfully:", prediction);

                  // Create success embed
                  const successEmbed = new EmbedBuilder()
                    .setColor("#00ff00")
                    .setTitle("Prediction Registered!")
                    .setDescription(
                      `Your prediction has been saved successfully`
                    )
                    .addFields(
                      {
                        name: "Token",
                        value: selectedToken.name,
                        inline: true,
                      },
                      {
                        name: "Timeframe",
                        value: timeframeLabel,
                        inline: true,
                      },
                      {
                        name: "Direction",
                        value: choice.toUpperCase(),
                        inline: true,
                      },
                      {
                        name: "Points Wagered",
                        value: `${pointsToWager}`,
                        inline: true,
                      }
                    )
                    .setFooter({ text: "Good luck!" });

                  // Update the message with success
                  try {
                    await buttonInteraction.update({
                      embeds: [successEmbed],
                      components: [],
                    });
                  } catch (updateError) {
                    console.error(
                      "Error updating message with success:",
                      updateError
                    );
                    return;
                  }

                  // Send public message in the predictions channel
                  try {
                    const predictionsChannel =
                      (await interaction.guild?.channels.fetch(
                        process.env.FEED_CHANNEL_ID || ""
                      )) as TextChannel;
                    if (predictionsChannel) {
                      const publicEmbed = new EmbedBuilder()
                        .setColor("#0099ff")
                        .setTitle("New Token Prediction")
                        .setDescription(
                          `${interaction.user} has made a new prediction!`
                        )
                        .addFields(
                          {
                            name: "User",
                            value: `${interaction.user.username}`,
                            inline: true,
                          },
                          {
                            name: "Token",
                            value: selectedToken.name,
                            inline: true,
                          },
                          {
                            name: "Timeframe",
                            value: timeframeLabel,
                            inline: true,
                          },
                          {
                            name: "Direction",
                            value: choice.toUpperCase(),
                            inline: true,
                          },
                          {
                            name: "Points Wagered",
                            value: `${pointsToWager}`,
                            inline: true,
                          },
                          {
                            name: "Expires",
                            value: `<t:${Math.floor(
                              expiresAt.getTime() / 1000
                            )}:R>`,
                            inline: true,
                          }
                        )
                        .setTimestamp()
                        .setThumbnail(interaction.user.displayAvatarURL());

                      await predictionsChannel.send({
                        embeds: [publicEmbed],
                      });
                    }
                  } catch (error) {
                    console.error(
                      "Error sending public prediction message:",
                      error
                    );
                  }
                } catch (error) {
                  console.error("Error in button interaction:", error);
                  try {
                    await buttonInteraction.update({
                      content:
                        "An error occurred while processing your prediction. Please try again.",
                      embeds: [],
                      components: [],
                    });
                  } catch (updateError) {
                    console.error("Error updating message:", updateError);
                  }
                }
              }
            );

            buttonCollector.on("end", (collected) => {
              if (collected.size === 0) {
                const timeoutEmbed = new EmbedBuilder()
                  .setColor("#ff9900")
                  .setTitle("Time's Up!")
                  .setDescription(
                    "No prediction was made within the time limit."
                  )
                  .setFooter({
                    text: "Use the command again to make a new prediction",
                  });

                interaction.editReply({
                  embeds: [timeoutEmbed],
                  components: [],
                });
              }
            });
          } catch (error) {
            console.error("Error in points selection:", error);
            try {
              await pointsInteraction.update({
                content:
                  "An error occurred while processing your points selection. Please try again.",
                embeds: [],
                components: [],
              });
            } catch (updateError) {
              console.error("Error updating message:", updateError);
            }
            return;
          }
        }
      );

      pointsCollector.on("end", (collected) => {
        if (collected.size === 0) {
          const timeoutEmbed = new EmbedBuilder()
            .setColor("#ff9900")
            .setTitle("Time's Up!")
            .setDescription("No points were selected within the time limit.")
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
