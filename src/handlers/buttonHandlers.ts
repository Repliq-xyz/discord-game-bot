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
  for (let i = 0; i < maxAttempts; i++) {
    const battle = await TokenPredictionBattle.getBattle(battleId);
    if (battle && battle.joined && battle.joinerId && battle.joinerToken) {
      return battle;
    }
    // Wait for 500ms before next attempt
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return null;
}

export async function handleTokenSelect(
  interaction: StringSelectMenuInteraction
) {
  try {
    const battleId = interaction.message.reference?.messageId;
    if (!battleId) {
      await interaction.reply({
        content: "Could not find the battle message!",
        ephemeral: true,
      });
      return;
    }

    const battle = await TokenPredictionBattle.getBattle(battleId);
    if (!battle) {
      await interaction.reply({
        content: "Battle not found!",
        ephemeral: true,
      });
      return;
    }

    // Check if user has enough points
    const userPoints = await UserService.getUserPoints(interaction.user.id);
    if (userPoints < battle.points) {
      await interaction.reply({
        content: `You don't have enough points! You need ${battle.points} points to join this battle.`,
        ephemeral: true,
      });
      return;
    }

    const selectedToken = interaction.values[0];
    await TokenPredictionBattle.joinBattle(
      battleId,
      interaction.user.id,
      selectedToken
    );

    // Remove points from joiner
    await UserService.updatePoints(interaction.user.id, -battle.points);

    // Wait for battle update
    const updatedBattle = await waitForBattleUpdate(battleId);
    if (!updatedBattle) {
      // Return points if battle update failed
      await UserService.updatePoints(interaction.user.id, battle.points);
      await interaction.reply({
        content: "Failed to join battle. Your points have been returned.",
        ephemeral: true,
      });
      return;
    }

    // Get the original message to edit
    const originalMessage = await interaction.message.fetch();
    if (!originalMessage) {
      await interaction.reply({
        content: "Could not find the original message!",
        ephemeral: true,
      });
      return;
    }

    // Update battle message
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

    await originalMessage.edit({
      embeds: [updatedEmbed],
      components: [],
    });

    // Send feed message
    const feedChannel = await client.channels.fetch(
      process.env.FEED_CHANNEL_ID || ""
    );
    if (feedChannel?.isTextBased()) {
      const textChannel = feedChannel as TextChannel;
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

      await textChannel.send({ embeds: [feedEmbed] });
    }

    await interaction.reply({
      content: `You have joined the battle! ${battle.points} points have been deducted from your balance.`,
      ephemeral: true,
    });

    // Add battle check to queue
    await BattleQueue.addBattleCheck(battleId, battle.endTime - Date.now());
  } catch (error: any) {
    console.error("Error handling token select:", error);
    await interaction.reply({
      content: `Error joining battle: ${error.message}`,
      ephemeral: true,
    });
  }
}
