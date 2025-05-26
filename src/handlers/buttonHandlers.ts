import {
  ButtonInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
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

    // Create token selection menu
    const tokenSelect = new StringSelectMenuBuilder()
      .setCustomId("select_token")
      .setPlaceholder("Select your token")
      .addOptions(
        TokenPredictionBattle.getAvailableTokens().map((token) =>
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

    const updatedEmbed = new EmbedBuilder()
      .setColor("#0099ff")
      .setTitle("Token Prediction Battle")
      .setDescription("Battle is in progress!")
      .addFields(
        { name: "Creator", value: `<@${battle.creatorId}>`, inline: true },
        { name: "Creator's Token", value: battle.creatorToken, inline: true },
        { name: "Joiner", value: `<@${battle.joinerId}>`, inline: true },
        { name: "Joiner's Token", value: battle.joinerToken!, inline: true },
        { name: "Timeframe", value: battle.timeframe, inline: true },
        { name: "Points", value: battle.points.toString(), inline: true }
      )
      .setTimestamp();

    await interaction.message.edit({
      embeds: [updatedEmbed],
      components: [],
    });

    await interaction.reply({
      content: "You have joined the battle!",
      ephemeral: true,
    });

    // Set up result checking
    setTimeout(async () => {
      const result = await TokenPredictionBattle.checkBattleResult(
        interaction.message.reference?.messageId
      );
      if (result) {
        const resultEmbed = new EmbedBuilder()
          .setColor("#00ff00")
          .setTitle("Battle Result")
          .setDescription(`Winner: <@${result.winner}>`)
          .addFields(
            {
              name: "Points Won",
              value: result.points.toString(),
              inline: true,
            },
            {
              name: "Loser",
              value: `<@${result.loser}>`,
              inline: true,
            }
          )
          .setTimestamp();

        await interaction.message.edit({
          embeds: [resultEmbed],
          components: [],
        });
      }
    }, battle.endTime - Date.now());
  } catch (error: any) {
    console.error("Error handling token select:", error);
    await interaction.reply({
      content: `Error joining battle: ${error.message}`,
      ephemeral: true,
    });
  }
}
