import type { AutocompleteInteraction, ChatInputCommandInteraction } from "discord.js";
import { instanceChoices, getInstance, listInstances, resolveInstance } from "../../../utils/instances";

export async function autocompleteInstances(interaction: AutocompleteInteraction) {
  const focused = interaction.options.getFocused();
  const instances = await listInstances();
  await interaction.respond(instanceChoices(instances, focused));
}

export async function resolveSelectedInstance(interaction: ChatInputCommandInteraction) {
  const query = interaction.options.getString("instance", true);
  const direct = await getInstance(query);
  if (direct) return direct;

  const instances = await listInstances();
  const match = resolveInstance(instances, query);
  if (!match) {
    await interaction.reply({ content: "Instance not found.", ephemeral: true });
    return null;
  }
  return match;
}
