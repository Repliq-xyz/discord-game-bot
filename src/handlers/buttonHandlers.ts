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
    console.log("Starting handleTokenSelect...");
    const battleId = interaction.message.reference?.messageId;
    console.log("Battle ID from reference:", battleId);

    if (!battleId) {
      console.log("No battle ID found in message reference");
      await interaction.reply({
        content: "Could not find the battle message!",
        ephemeral: true,
      });
      return;
    }

    const battle = await TokenPredictionBattle.getBattle(battleId);
    console.log("Retrieved battle:", battle);

    if (!battle) {
      console.log("Battle not found in database");
      await interaction.reply({
        content: "Battle not found!",
        ephemeral: true,
      });
      return;
    }

    // Check if user has enough points
    const userPoints = await UserService.getUserPoints(interaction.user.id);
    console.log("User points:", userPoints, "Required points:", battle.points);

    if (userPoints < battle.points) {
      console.log("User doesn't have enough points");
      await interaction.reply({
        content: `You don't have enough points! You need ${battle.points} points to join this battle.`,
        ephemeral: true,
      });
      return;
    }

    const selectedToken = interaction.values[0];
    console.log("Selected token:", selectedToken);

    console.log("Attempting to join battle...");
    await TokenPredictionBattle.joinBattle(
      battleId,
      interaction.user.id,
      selectedToken
    );
    console.log("Successfully called joinBattle");

    // Remove points from joiner
    console.log("Removing points from joiner...");
    await UserService.updatePoints(interaction.user.id, -battle.points);
    console.log("Points removed successfully");

    // Wait for battle update
    console.log("Waiting for battle update...");
    const updatedBattle = await waitForBattleUpdate(battleId);
    console.log("Updated battle:", updatedBattle);

    if (!updatedBattle) {
      console.log("Battle update failed, returning points");
      // Return points if battle update failed
      await UserService.updatePoints(interaction.user.id, battle.points);
      await interaction.reply({
        content: "Failed to join battle. Your points have been returned.",
        ephemeral: true,
      });
      return;
    }

    // Get the original message to edit
    console.log("Fetching battle channel:", battle.channelId);
    const channel = await client.channels.fetch(battle.channelId);
    console.log("Channel fetched:", channel?.id);

    if (!channel?.isTextBased()) {
      console.log("Channel is not text based");
      await interaction.reply({
        content: "Could not find the battle channel!",
        ephemeral: true,
      });
      return;
    }

    const textChannel = channel as TextChannel;
    console.log("Fetching original message:", battleId);
    const originalMessage = await textChannel.messages.fetch(battleId);
    console.log("Original message fetched:", originalMessage?.id);

    if (!originalMessage) {
      console.log("Could not find original message");
      await interaction.reply({
        content: "Could not find the original message!",
        ephemeral: true,
      });
      return;
    }

    // Update battle message
    console.log("Creating updated embed...");
    const updatedEmbed = new EmbedBuilder()
      .setColor("#0099ff")
      .setTitle("Token Prediction Battle")
      .setDescription("Battle is in progress!")
      .addFields(
        { name: "Creator", value: `<@${battle.creatorId}>`, inline: true },
        {
          name: "Creator's Token",
          value:
            tokens.find((t) => t.tokenAddress === battle.creatorToken)?.name ||
            battle.creatorToken,
          inline: true,
        },
        { name: "Joiner", value: `<@${interaction.user.id}>`, inline: true },
        {
          name: "Joiner's Token",
          value:
            tokens.find((t) => t.tokenAddress === selectedToken)?.name ||
            selectedToken,
          inline: true,
        },
        { name: "Timeframe", value: battle.timeframe, inline: true },
        { name: "Points", value: battle.points.toString(), inline: true }
      )
      .setTimestamp();

    console.log("Editing original message...");
    await originalMessage.edit({
      embeds: [updatedEmbed],
      components: [],
    });
    console.log("Message edited successfully");

    // Send feed message
    console.log("Fetching feed channel...");
    const feedChannel = await client.channels.fetch(
      process.env.FEED_CHANNEL_ID || ""
    );
    console.log("Feed channel fetched:", feedChannel?.id);

    if (feedChannel?.isTextBased()) {
      const textChannel = feedChannel as TextChannel;
      console.log("Creating feed embed...");
      const feedEmbed = new EmbedBuilder()
        .setColor("#00ff00")
        .setTitle("Battle Joined!")
        .setDescription("A new battle has been joined!")
        .addFields(
          { name: "Creator", value: `<@${battle.creatorId}>`, inline: true },
          {
            name: "Creator's Token",
            value:
              tokens.find((t) => t.tokenAddress === battle.creatorToken)
                ?.name || battle.creatorToken,
            inline: true,
          },
          { name: "Joiner", value: `<@${interaction.user.id}>`, inline: true },
          {
            name: "Joiner's Token",
            value:
              tokens.find((t) => t.tokenAddress === selectedToken)?.name ||
              selectedToken,
            inline: true,
          },
          { name: "Timeframe", value: battle.timeframe, inline: true },
          { name: "Points", value: battle.points.toString(), inline: true }
        )
        .setTimestamp();

      console.log("Sending feed message...");
      await textChannel.send({ embeds: [feedEmbed] });
      console.log("Feed message sent successfully");
    }

    console.log("Sending success reply to user...");
    await interaction.reply({
      content: `You have joined the battle! ${battle.points} points have been deducted from your balance.`,
      ephemeral: true,
    });

    // Add battle check to queue
    console.log("Adding battle check to queue...");
    await BattleQueue.addBattleCheck(battleId, battle.endTime - Date.now());
    console.log("Battle check added to queue successfully");
  } catch (error: any) {
    console.error("Error in handleTokenSelect:", error);
    console.error("Error stack:", error.stack);
    await interaction.reply({
      content: `Error joining battle: ${error.message}`,
      ephemeral: true,
    });
  }
}

// Job 2 failed for battle 1376558267748192256: TypeError: job.finished is not a function
