import {
  ButtonInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextChannel,
  StringSelectMenuInteraction,
} from "discord.js";
import { TokenPredictionBattle } from "../services/tokenPredictionBattle";
import { BattleQueue } from "../services/battleQueue";
import { UserService } from "../services/userService";
import { client } from "../index";
import { tokens } from "../data/tokens";

export async function handleJoinBattle(interaction: ButtonInteraction) {
  try {
    const battleId = interaction.message.id;
    const battle = await TokenPredictionBattle.getBattle(battleId);

    if (!battle) {
      await interaction.reply({
        content: "Battle not found!",
        ephemeral: true,
      });
      return;
    }

    if (battle.joined) {
      await interaction.reply({
        content: "This battle already has a joiner!",
        ephemeral: true,
      });
      return;
    }

    // Get available tokens excluding the creator's token
    const availableTokens = TokenPredictionBattle.getAvailableTokens().filter(
      (token) => token.value !== battle.creatorToken
    );

    if (availableTokens.length === 0) {
      await interaction.reply({
        content: "No available tokens to select!",
        ephemeral: true,
      });
      return;
    }

    // Create token selection menu
    const tokenSelect = new StringSelectMenuBuilder()
      .setCustomId("select_token")
      .setPlaceholder("Select your token")
      .addOptions(
        availableTokens.map((token) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(token.name)
            .setValue(token.value)
        )
      );

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      tokenSelect
    );

    await interaction.reply({
      content: "Select your token to join the battle:",
      components: [row],
      ephemeral: true,
    });
  } catch (error: any) {
    console.error("Error handling join battle:", error);
    await interaction.reply({
      content: `Error joining battle: ${error.message}`,
      ephemeral: true,
    });
  }
}

async function waitForBattleUpdate(
  battleId: string,
  maxAttempts = 5
): Promise<any> {
  console.log("Starting waitForBattleUpdate with battleId:", battleId);
  for (let i = 0; i < maxAttempts; i++) {
    console.log(`Attempt ${i + 1} of ${maxAttempts}`);
    const battle = await TokenPredictionBattle.getBattle(battleId);
    console.log("Retrieved battle in waitForBattleUpdate:", battle);

    if (battle && battle.joined && battle.joinerId && battle.joinerToken) {
      console.log("Battle update successful!");
      return battle;
    }
    console.log("Battle not yet updated, waiting 500ms...");
    // Wait for 500ms before next attempt
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  console.log("Max attempts reached, battle update failed");
  return null;
}

export async function handleTokenSelect(
  interaction: StringSelectMenuInteraction
) {
  try {
    console.log("Starting handleTokenSelect function");
    // Get the original message ID from the interaction
    const battleId = interaction.message.reference?.messageId;
    console.log("Retrieved battle ID from reference:", battleId);

    if (!battleId) {
      await interaction.reply({
        content: "Could not find the battle message!",
        ephemeral: true,
      });
      return;
    }

    // Get user points first
    const userPoints = await UserService.getUserPoints(interaction.user.id);
    console.log("User points:", userPoints);

    // Get battle
    const battle = await TokenPredictionBattle.getBattle(battleId);
    console.log("Retrieved battle:", battle);

    if (!battle) {
      await interaction.reply({
        content: "Battle not found.",
        ephemeral: true,
      });
      return;
    }

    if (battle.joined) {
      await interaction.reply({
        content: "This battle already has a participant.",
        ephemeral: true,
      });
      return;
    }

    if (battle.creatorId === interaction.user.id) {
      await interaction.reply({
        content: "You cannot join your own battle.",
        ephemeral: true,
      });
      return;
    }

    // Check if user has enough points
    if (userPoints < battle.points) {
      await interaction.reply({
        content: `You don't have enough points to join this battle. Required: ${battle.points}, You have: ${userPoints}`,
        ephemeral: true,
      });
      return;
    }

    const selectedToken = interaction.values[0];
    console.log("Selected token:", selectedToken);

    // Remove points from user first
    await UserService.updatePoints(interaction.user.id, -battle.points);
    console.log("Removed points from user");

    try {
      // Join battle
      await TokenPredictionBattle.joinBattle(
        battleId,
        interaction.user.id,
        selectedToken
      );
      console.log("Successfully joined battle");

      // Get updated battle
      const updatedBattle = await TokenPredictionBattle.getBattle(battleId);
      console.log("Updated battle:", updatedBattle);

      if (!updatedBattle) {
        throw new Error("Failed to get updated battle");
      }

      // Get channel and message
      const channel = await client.channels.fetch(battle.channelId);
      if (!channel?.isTextBased()) {
        throw new Error("Channel not found or not text-based");
      }
      const textChannel = channel as TextChannel;
      const message = await textChannel.messages.fetch(battleId);
      if (!message) {
        throw new Error("Message not found");
      }

      // Create updated embed
      const updatedEmbed = {
        color: 0x0099ff,
        title: "Token Prediction Battle",
        description: `Battle between <@${updatedBattle.creatorId}> and <@${updatedBattle.joinerId}>`,
        fields: [
          {
            name: "Creator's Token",
            value:
              tokens.find((t) => t.tokenAddress === updatedBattle.creatorToken)
                ?.name || "Unknown",
            inline: true,
          },
          {
            name: "Joiner's Token",
            value:
              tokens.find((t) => t.tokenAddress === updatedBattle.joinerToken)
                ?.name || "Unknown",
            inline: true,
          },
          {
            name: "Timeframe",
            value: `${updatedBattle.timeframe} hours`,
            inline: true,
          },
          {
            name: "Points",
            value: updatedBattle.points.toString(),
            inline: true,
          },
        ],
        timestamp: new Date().toISOString(),
      };

      // Update message
      await message.edit({
        embeds: [updatedEmbed],
        components: [],
      });
      console.log("Updated battle message");

      // Send feed message
      const feedChannel = await client.channels.fetch(
        process.env.FEED_CHANNEL_ID || ""
      );
      if (feedChannel?.isTextBased()) {
        const textChannel = feedChannel as TextChannel;
        const feedEmbed = {
          color: 0x00ff00,
          title: "Battle Joined",
          description: `<@${interaction.user.id}> has joined the battle against <@${updatedBattle.creatorId}>`,
          fields: [
            {
              name: "Creator's Token",
              value:
                tokens.find(
                  (t) => t.tokenAddress === updatedBattle.creatorToken
                )?.name || "Unknown",
              inline: true,
            },
            {
              name: "Joiner's Token",
              value:
                tokens.find((t) => t.tokenAddress === updatedBattle.joinerToken)
                  ?.name || "Unknown",
              inline: true,
            },
            {
              name: "Points",
              value: updatedBattle.points.toString(),
              inline: true,
            },
          ],
          timestamp: new Date().toISOString(),
        };

        await textChannel.send({ embeds: [feedEmbed] });
        console.log("Sent feed message");
      }

      // Add battle check to queue
      const delay = updatedBattle.endTime - Date.now();
      await BattleQueue.addBattleCheck(battleId, delay);
      console.log("Added battle check to queue");

      // Delete the token selection message
      try {
        await interaction.message.delete();
        console.log("Deleted token selection message");
      } catch (error) {
        console.error("Error deleting token selection message:", error);
      }

      await interaction.reply({
        content: "You have successfully joined the battle!",
        ephemeral: true,
      });
      console.log("Successfully replied to user");
    } catch (error) {
      console.error("Error in battle join process:", error);
      // Return points to user if battle join fails
      await UserService.updatePoints(interaction.user.id, battle.points);
      await interaction.reply({
        content: "Failed to join battle. Your points have been returned.",
        ephemeral: true,
      });
    }
  } catch (error) {
    console.error("Error in handleTokenSelect:", error);
    await interaction.reply({
      content: "An error occurred while processing your request.",
      ephemeral: true,
    });
  }
}
