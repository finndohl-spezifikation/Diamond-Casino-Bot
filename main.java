package de.casinobot;

import net.dv8tion.jda.api.JDA;
import net.dv8tion.jda.api.JDABuilder;
import net.dv8tion.jda.api.requests.GatewayIntent;

public class Main {

    public static void main(String[] args) throws Exception {
        String token = System.getenv("DISCORD_TOKEN");

        if (token == null || token.isEmpty()) {
            System.err.println("[FEHLER] Kein DISCORD_TOKEN gesetzt! Bitte in den Railway Umgebungsvariablen setzen.");
            System.exit(1);
        }

        JDA jda = JDABuilder.createDefault(token)
                .enableIntents(
                        GatewayIntent.GUILD_MESSAGES,
                        GatewayIntent.MESSAGE_CONTENT,
                        GatewayIntent.GUILD_MEMBERS
                )
                .addEventListeners(new CommandListener())
                .build();

        jda.awaitReady();
        System.out.println("[INFO] Bot ist online! Eingeloggt als: " + jda.getSelfUser().getAsTag());
    }
}
