import { Collection, REST, Routes } from "discord.js";
import { Command } from "../types/Command";
import fs from "fs";
import path from "path";

export class CommandHandler {
  private commands: Collection<string, Command> = new Collection();

  constructor() {
    this.loadCommands();
  }

  private async loadCommands() {
    try {
      const commandsPath = path.join(__dirname, "../commands");
      console.log("Loading commands from:", commandsPath);

      const commandFiles = fs
        .readdirSync(commandsPath)
        .filter((file) => file.endsWith(".ts") || file.endsWith(".js"));

      console.log("Found command files:", commandFiles);

      for (const file of commandFiles) {
        try {
          const filePath = path.join(commandsPath, file);
          console.log("Loading command from:", filePath);

          const { command } = await import(filePath);

          if ("data" in command && "execute" in command) {
            this.commands.set(command.data.name, command);
            console.log(`Successfully loaded command: ${command.data.name}`);
          } else {
            console.warn(
              `The command at ${filePath} is missing a required "data" or "execute" property.`
            );
          }
        } catch (error) {
          console.error(`Error loading command from ${file}:`, error);
        }
      }

      console.log("All commands loaded. Total commands:", this.commands.size);
    } catch (error) {
      console.error("Error loading commands:", error);
    }
  }

  public async registerCommands(clientId: string, guildId: string) {
    const rest = new REST().setToken(process.env.DISCORD_TOKEN!);
    const commands = this.commands.map((command) => command.data.toJSON());

    try {
      console.log("Starting slash commands registration...");
      console.log(
        "Registering commands:",
        commands.map((cmd) => cmd.name)
      );

      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: commands,
      });

      console.log("Slash commands registered successfully!");
    } catch (error) {
      console.error("Error registering commands:", error);
      throw error;
    }
  }

  public getCommands(): Collection<string, Command> {
    return this.commands;
  }
}
