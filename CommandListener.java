package de.casinobot;

import net.dv8tion.jda.api.EmbedBuilder;
import net.dv8tion.jda.api.events.message.MessageReceivedEvent;
import net.dv8tion.jda.api.hooks.ListenerAdapter;

import java.awt.Color;
import java.time.Instant;

public class CommandListener extends ListenerAdapter {

    private static final String PREFIX = "!";

    @Override
    public void onMessageReceived(MessageReceivedEvent event) {
        // Nachrichten von Bots ignorieren
        if (event.getAuthor().isBot()) return;

        String message = event.getMessage().getContentRaw().trim();

        // Pruefen ob es ein Command ist
        if (!message.startsWith(PREFIX)) return;

        String[] args = message.substring(PREFIX.length()).split("\\s+");
        String command = args[0].toLowerCase();

        switch (command) {
            case "hallo":
                handleHallo(event);
                break;
            default:
                break;
        }
    }

    private void handleHallo(MessageReceivedEvent event) {
        String username = event.getAuthor().getName();

        EmbedBuilder embed = new EmbedBuilder();
        embed.setTitle("\ud83c\udfb0 GTA RP Casino - Willkommen!");
        embed.setDescription(
            "Hallo, **" + username + "**! \ud83d\udc4b\n\n" +
            "Willkommen im **GTA Roleplay Casino Bot**!\n" +
            "Hier kannst du dein Glueck in spannenden Casino-Spielen versuchen.\n\n" +
            "\u2728 Schreib `!hilfe` fuer eine Liste aller Befehle."
        );
        embed.setColor(new Color(255, 215, 0)); // Gold
        embed.setFooter("GTA RP Casino Bot", null);
        embed.setTimestamp(Instant.now());

        event.getChannel().sendMessageEmbeds(embed.build()).queue();
    }
}
