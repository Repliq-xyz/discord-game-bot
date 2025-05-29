import {
  SlashCommandBuilder,
  CommandInteraction,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  EmbedBuilder,
  TextChannel,
  PermissionFlagsBits,
} from "discord.js";
import { Command } from "../types/Command";
import { UserService } from "../services/userService";

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("quick-reward")
    .setDescription("Create a quick reward message for users to claim")
    .addIntegerOption((option) =>
      option
        .setName("points")
        .setDescription("Number of points to give to winners")
        .setRequired(true)
        .setMinValue(1)
    )
    .addIntegerOption((option) =>
      option
        .setName("winners")
        .setDescription("Number of winners")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(10)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator | PermissionFlagsBits.ModerateMembers
    ),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;

    // Check if user has admin or staff permissions
    if (
      !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) &&
      !interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)
    ) {
      await interaction.reply({
        content: "You don't have permission to use this command.",
        ephemeral: true,
      });
      return;
    }

    const points = interaction.options.getInteger("points");
    const winners = interaction.options.getInteger("winners");

    if (!points || !winners) {
      await interaction.reply({
        content: "Please provide both points and number of winners.",
        ephemeral: true,
      });
      return;
    }

    // Create the reward button
    const button = new ButtonBuilder()
      .setCustomId("quick_reward_claim")
      .setLabel("Claim Reward")
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

    // Create the reward embed
    const rewardEmbed = new EmbedBuilder()
      .setColor("#00ff00")
      .setTitle("🎁 Quick Reward")
      .setDescription(
        `Be one of the first ${winners} to click the button below to claim ${points} points!`
      )
      .addFields(
        { name: "Points to Win", value: points.toString(), inline: true },
        { name: "Number of Winners", value: winners.toString(), inline: true }
      )
      .setFooter({ text: `Created by ${interaction.user.username}` })
      .setTimestamp();

    // Send the reward message in the feed channel
    try {
      const feedChannel = (await interaction.guild?.channels.fetch(
        process.env.FEED_CHANNEL_ID || ""
      )) as TextChannel;

      if (!feedChannel) {
        await interaction.reply({
          content: "Feed channel not found!",
          ephemeral: true,
        });
        return;
      }

      const message = await feedChannel.send({
        embeds: [rewardEmbed],
        components: [row],
      });

      // Create a collector for the button clicks
      const collector = message.createMessageComponentCollector({
        filter: (i) => i.customId === "quick_reward_claim",
        max: winners,
        time: 5 * 60 * 1000, // 5 minutes
      });

      const winnersList: string[] = [];

      collector.on("collect", async (i) => {
        try {
          if (winnersList.includes(i.user.id)) {
            await i.reply({
              content: "You've already claimed this reward!",
              ephemeral: true,
            });
            return;
          }

          winnersList.push(i.user.id);
          await UserService.updatePoints(i.user.id, points);

          await i.reply({
            content: `Congratulations! You've won ${points} points!`,
            ephemeral: true,
          });

          // Update the embed to show remaining spots
          const remainingSpots = winners - winnersList.length;
          if (remainingSpots > 0) {
            const updatedEmbed = EmbedBuilder.from(rewardEmbed).setDescription(
              `Be one of the first ${winners} to click the button below to claim ${points} points!\n\nRemaining spots: ${remainingSpots}`
            );

            await message.edit({
              embeds: [updatedEmbed],
              components: [row],
            });
          } else {
            // If all spots are filled, end the collector
            collector.stop("all_spots_filled");
          }
        } catch (error) {
          console.error("Error handling button click:", error);
          try {
            if (!i.replied && !i.deferred) {
              await i.reply({
                content:
                  "An error occurred while processing your claim. Please try again.",
                ephemeral: true,
              });
            }
          } catch (replyError) {
            console.error("Error sending error message:", replyError);
          }
        }
      });

      collector.on("end", async (collected, reason) => {
        try {
          // Disable the button
          const disabledButton = ButtonBuilder.from(button)
            .setDisabled(true)
            .setLabel("Reward Ended");

          const disabledRow =
            new ActionRowBuilder<ButtonBuilder>().addComponents(disabledButton);

          // Create final embed
          const finalEmbed = new EmbedBuilder()
            .setColor("#808080")
            .setTitle("🎁 Quick Reward Ended")
            .setDescription(
              `This reward has ended. ${winnersList.length} users won ${points} points each!`
            )
            .addFields(
              {
                name: "Points Awarded",
                value: points.toString(),
                inline: true,
              },
              {
                name: "Number of Winners",
                value: winnersList.length.toString(),
                inline: true,
              }
            )
            .setFooter({ text: `Created by ${interaction.user.username}` })
            .setTimestamp();

          await message.edit({
            embeds: [finalEmbed],
            components: [disabledRow],
          });
        } catch (error) {
          console.error("Error ending reward:", error);
        }
      });

      await interaction.reply({
        content: "Quick reward message has been created!",
        ephemeral: true,
      });
    } catch (error) {
      console.error("Error creating quick reward:", error);
      await interaction.reply({
        content: "An error occurred while creating the quick reward.",
        ephemeral: true,
      });
    }
  },
};
