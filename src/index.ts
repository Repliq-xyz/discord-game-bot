import { Client, GatewayIntentBits, Events } from "discord.js";
import { CommandHandler } from "./handlers/commandHandler";
import { PredictionQueue } from "./services/predictionQueue";
import { BattleQueue } from "./services/battleQueue";
import { handleJoinBattle, handleTokenSelect } from "./handlers/buttonHandlers";
import { handleButtonInteraction } from "./handlers/buttonHandler";
import { PermanentMessageService } from "./services/permanentMessage";
import { initializeRedis } from "./services/redis";
import dotenv from "dotenv";

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

export { client };

const commandHandler = new CommandHandler();
let isInitialized = false;

client.once(Events.ClientReady, async (readyClient) => {
  if (isInitialized) return;
  isInitialized = true;

  console.log(`Connected as ${readyClient.user.tag}!`);
  console.log("Starting slash commands registration...");

  // Replace these values with your bot ID and server ID
  const clientId = readyClient.user.id;
  const guildId = process.env.GUILD_ID!;

  try {
    // Initialize Redis
    await initializeRedis();
    console.log("Redis initialized successfully!");

    await commandHandler.registerCommands(clientId, guildId);
    console.log("Slash commands registered successfully!");

    // Log all registered commands
    const commands = commandHandler.getCommands();
    console.log("Registered commands:", Array.from(commands.keys()));

    // Initialize prediction queue
    await PredictionQueue.initialize();
    console.log("Prediction queue initialized successfully!");

    // Initialize battle queue
    await BattleQueue.initialize();
    console.log("Battle queue initialized successfully!");

    // Create or update permanent message
    const permanentMessageService = PermanentMessageService.getInstance();
    await permanentMessageService.createOrUpdateMessage(client);
    console.log("Permanent message created/updated successfully!");
  } catch (error) {
    console.error("Error during initialization:", error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = commandHandler.getCommands().get(interaction.commandName);

      if (!command) {
        console.error(`No command ${interaction.commandName} was found.`);
        return;
      }

      try {
        console.log(`Executing command: ${interaction.commandName}`);
        await command.execute(interaction);
      } catch (error) {
        console.error(
          `Error executing command ${interaction.commandName}:`,
          error
        );
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: "There was an error while executing this command!",
            ephemeral: true,
          });
        } else {
          await interaction.reply({
            content: "There was an error while executing this command!",
            ephemeral: true,
          });
        }
      }
    } else if (interaction.isButton()) {
      // Check if interaction has already been handled
      if (interaction.replied || interaction.deferred) {
        return;
      }

      if (interaction.customId === "join_battle") {
        await handleJoinBattle(interaction);
      } else {
        await handleButtonInteraction(interaction);
      }
    } else if (interaction.isStringSelectMenu()) {
      // Check if interaction has already been handled
      if (interaction.replied || interaction.deferred) {
        return;
      }

      if (interaction.customId === "select_token") {
        await handleTokenSelect(interaction);
      }
    }
  } catch (error) {
    console.error("Error handling interaction:", error);
    try {
      // Only try to reply if the interaction hasn't been handled and is a command
      if (
        interaction.isChatInputCommand() &&
        !interaction.replied &&
        !interaction.deferred
      ) {
        await interaction.reply({
          content: "An error occurred while processing your request.",
          ephemeral: true,
        });
      }
    } catch (replyError) {
      console.error("Error sending error message:", replyError);
    }
  }
});

// Bot token must be defined in .env file
client.login(process.env.DISCORD_TOKEN);
