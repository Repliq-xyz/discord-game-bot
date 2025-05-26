import {
  ButtonInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextChannel,
} from "discord.js";
import { TokenPredictionBattle } from "../services/tokenPredictionBattle";
import { BattleQueue } from "../services/battleQueue";

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

export async function handleTokenSelect(interaction: any) {
  try {
    const battleId = interaction.message.reference?.messageId;
    if (!battleId) {
      await interaction.reply({
        content: "Could not find the battle message!",
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

    // Update battle message
    const battle = await TokenPredictionBattle.getBattle(battleId);
    if (!battle) {
      await interaction.reply({
        content: "Battle not found!",
        ephemeral: true,
      });
      return;
    }

    const tokens = await TokenPredictionBattle.getAvailableTokens();
    const updatedEmbed = new EmbedBuilder()
      .setColor("#0099ff")
      .setTitle("Token Prediction Battle")
      .setDescription("Battle is in progress!")
      .addFields(
        { name: "Creator", value: `<@${battle.creatorId}>`, inline: true },
        {
          name: "Creator's Token",
          value:
            tokens.find((t) => t.value === battle.creatorToken)?.name ||
            battle.creatorToken ||
            "Unknown",
          inline: true,
        },
        { name: "Joiner", value: `<@${interaction.user.id}>`, inline: true },
        {
          name: "Joiner's Token",
          value:
            tokens.find((t) => t.value === selectedToken)?.name ||
            selectedToken ||
            "Unknown",
          inline: true,
        },
        {
          name: "Timeframe",
          value: battle.timeframe || "Unknown",
          inline: true,
        },
        { name: "Points", value: (battle.points || 0).toString(), inline: true }
      )
      .setTimestamp();

    // Get the original message to edit
    const originalMessage = await interaction.message.fetchReference();
    await originalMessage.edit({
      embeds: [updatedEmbed],
      components: [],
    });

    await interaction.reply({
      content: "You have joined the battle!",
      ephemeral: true,
    });

    // Send feed message about battle join
    const feedChannel = interaction.guild?.channels.cache.get(
      process.env.FEED_CHANNEL_ID as string
    ) as TextChannel;

    if (feedChannel) {
      const feedEmbed = new EmbedBuilder()
        .setColor("#00ff00")
        .setTitle("Battle Joined")
        .setDescription("A new battle has started!")
        .addFields(
          { name: "Creator", value: `<@${battle.creatorId}>`, inline: true },
          {
            name: "Creator's Token",
            value:
              tokens.find((t) => t.value === battle.creatorToken)?.name ||
              battle.creatorToken ||
              "Unknown",
            inline: true,
          },
          { name: "Joiner", value: `<@${interaction.user.id}>`, inline: true },
          {
            name: "Joiner's Token",
            value:
              tokens.find((t) => t.value === selectedToken)?.name ||
              selectedToken ||
              "Unknown",
            inline: true,
          },
          {
            name: "Timeframe",
            value: battle.timeframe || "Unknown",
            inline: true,
          },
          {
            name: "Points",
            value: (battle.points || 0).toString(),
            inline: true,
          }
        )
        .setTimestamp();

      await feedChannel.send({ embeds: [feedEmbed] });
    }

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
