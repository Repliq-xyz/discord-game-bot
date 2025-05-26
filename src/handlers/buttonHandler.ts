import { ButtonInteraction } from "discord.js";
import { startGame } from "../commands/start-game";

export async function handleButtonInteraction(interaction: ButtonInteraction) {
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
}
