import { Client, GatewayIntentBits, Events } from "discord.js";
import { CommandHandler } from "./handlers/commandHandler";
import dotenv from "dotenv";

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const commandHandler = new CommandHandler();

// Wait for commands to load before setting up the client
setTimeout(async () => {
  client.once(Events.ClientReady, async (readyClient) => {
    console.log(`Connected as ${readyClient.user.tag}!`);
    console.log("Starting slash commands registration...");

    // Replace these values with your bot ID and server ID
    const clientId = readyClient.user.id;
    const guildId = process.env.GUILD_ID!;

    try {
      await commandHandler.registerCommands(clientId, guildId);
      console.log("Slash commands registered successfully!");

      // Log all registered commands
      const commands = commandHandler.getCommands();
      console.log("Registered commands:", Array.from(commands.keys()));
    } catch (error) {
      console.error("Error registering commands:", error);
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

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
  });

  // Bot token must be defined in .env file
  client.login(process.env.DISCORD_TOKEN);
}, 1000); // Wait 1 second for commands to load
