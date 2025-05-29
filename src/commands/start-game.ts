import { ButtonInteraction } from "discord.js";
import { createPrivateChannel, createPrivateThread } from "./privateChannel";

export async function startGame(interaction: ButtonInteraction) {
  try {
    const thread = await createPrivateThread(interaction.user);
    await interaction.reply({
      content: `Your private games thread has been created: ${thread}`,
      ephemeral: true,
    });
  } catch (error) {
    console.error("Error in startGame:", error);
    await interaction.reply({
      content:
        "An error occurred while creating your private games channel. Please try again later.",
      ephemeral: true,
    });
  }
}
