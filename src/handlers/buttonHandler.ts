import { ButtonInteraction } from "discord.js";
import { startGame } from "../commands/start-game";

export async function handleButtonInteraction(interaction: ButtonInteraction) {
  // Ignore prediction-related buttons as they are handled in the tokenPrediction command
  if (interaction.customId === "up" || interaction.customId === "down") {
    return;
  }

  try {
    if (!interaction.isButton()) return;

    switch (interaction.customId) {
      case "start-game-button":
        await startGame(interaction);
        break;
      default:
        await interaction.reply({
          content: "An error occurred.",
          ephemeral: true,
        });
    }
  } catch (error) {
    console.error("Error handling button interaction:", error);
  }
}
