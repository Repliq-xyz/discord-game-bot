import { ButtonInteraction } from "discord.js";
import { startGame } from "../commands/start-game";

// List of button IDs that should be handled by specific commands
const COMMAND_HANDLED_BUTTONS = new Set([
  "up",
  "down",
  "points_10",
  "points_50",
  "points_100",
  "points_max",
  "join_battle",
]);

export async function handleButtonInteraction(interaction: ButtonInteraction) {
  // Ignore buttons that are handled by specific commands
  if (COMMAND_HANDLED_BUTTONS.has(interaction.customId)) {
    return;
  }

  try {
    if (!interaction.isButton()) return;

    // Check if interaction has already been handled
    if (interaction.replied || interaction.deferred) {
      return;
    }

    switch (interaction.customId) {
      case "start-game-button":
        await startGame(interaction);
        break;
      default:
        // Only reply if the interaction hasn't been handled
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "This button is not implemented yet.",
            ephemeral: true,
          });
        }
    }
  } catch (error) {
    console.error("Error handling button interaction:", error);
    try {
      // Only try to reply if the interaction hasn't been handled
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "An error occurred while processing this button.",
          ephemeral: true,
        });
      }
    } catch (replyError) {
      console.error("Error sending error message:", replyError);
    }
  }
}
