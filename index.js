require('dotenv').config();

const {
  Client, GatewayIntentBits, EmbedBuilder,
  REST, Routes, SlashCommandBuilder,
  MessageFlags, PermissionFlagsBits,
} = require('discord.js');

const eco = require('./economy');
const sm  = require('./slotMachine');
const hr  = require('./horseRace');
const bj  = require('./blackjack');

const TOKEN      = process.env.DISCORD_TOKEN;
const CLIENT_ID  = process.env.CLIENT_ID;
const ADMIN_ROLE = '1495237353529151528';

if (!TOKEN)     { console.error('[FEHLER] DISCORD_TOKEN fehlt!'); process.exit(1); }
if (!CLIENT_ID) { console.error('[FEHLER] CLIENT_ID fehlt!');     process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const sessions   = new Map();
const hrSessions = new Map();
const bjSessions = new Map();

const commands = [
  new SlashCommandBuilder()
    .setName('jetons')
    .setDescription('Zeigt deinen aktuellen Jetons-Stand'),

  new SlashCommandBuilder()
    .setName('jetons-give')
    .setDescription('Gibt einem Spieler Jetons [Nur Staff]')
    .addUserOption((o) => o.setName('spieler').setDescription('Welchem Spieler?').setRequired(true))
    .addIntegerOption((o) => o.setName('menge').setDescription('Wie viele Jetons?').setRequired(true).setMinValue(1))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('jetons-remove')
    .setDescription('Nimmt einem Spieler Jetons [Nur Staff]')
    .addUserOption((o) => o.setName('spieler').setDescription('Welchem Spieler?').setRequired(true))
    .addIntegerOption((o) => o.setName('menge').setDescription('Wie viele Jetons?').setRequired(true).setMinValue(1))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('delete')
    .setDescription('L\xF6scht Nachrichten [Nur Staff]')
    .addIntegerOption((o) => o.setName('menge').setDescription('Wie viele Nachrichten? (1\u2013100)').setRequired(true).setMinValue(1).setMaxValue(100))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('slot-machine')
    .setDescription('\uD83C\uDFB0 Spiele an der Slot Machine'),

  new SlashCommandBuilder()
    .setName('inside-track')
    .setDescription('\uD83C\uDFB4 Pferde-Rennen im Inside Track'),

  new SlashCommandBuilder()
    .setName('blackjack')
    .setDescription('\uD83C\uDCCF Spiele eine Runde Blackjack (bis zu 4 Spieler)'),
].map((c) => c.toJSON());

function isAdmin(interaction) {
  if (!interaction.guild) return false;
  if (interaction.guild.ownerId === interaction.user.id) return true;
  return interaction.member?.roles?.cache?.has(ADMIN_ROLE) ?? false;
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('clientReady', async () => {
  console.log(`[INFO] Bot online als: ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('[INFO] Slash Commands erfolgreich registriert!');
  } catch (e) {
    console.error('[FEHLER] Commands konnten nicht registriert werden:', e.message);
  }
});

client.on('interactionCreate', async (interaction) => {

  /* ═══════════════════════════════════════
     SLASH COMMANDS
  ═══════════════════════════════════════ */
  if (interaction.isChatInputCommand()) {
    const cmd = interaction.commandName;

    if (cmd === 'jetons') {
      const bal = eco.get(interaction.user.id);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle('\uD83C\uDFB0 Dein Jetons-Konto')
          .setDescription(`**${interaction.user.username}**, dein aktueller Kontostand:\n\n\uD83D\uDCB0 **${bal.toLocaleString('de-DE')} Jetons**`)
          .setColor(0x00BFFF).setFooter({ text: 'The Diamond Casino Richman' }).setTimestamp()],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (cmd === 'jetons-give') {
      if (!isAdmin(interaction)) return interaction.reply({ content: '\u274C Kein Zugriff!', flags: MessageFlags.Ephemeral });
      const target = interaction.options.getUser('spieler');
      const amount = interaction.options.getInteger('menge');
      const newBal = eco.add(target.id, amount);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle('\uD83D\uDCB8 Jetons hinzugef\xFCgt')
          .setDescription(`**${target.username}** hat **+${amount.toLocaleString('de-DE')} Jetons** erhalten!\nNeues Guthaben: **${newBal.toLocaleString('de-DE')} Jetons**`)
          .setColor(0x00BFFF).setFooter({ text: `Vergeben von: ${interaction.user.username} \u2022 The Diamond Casino Richman` }).setTimestamp()],
      });
    }

    if (cmd === 'jetons-remove') {
      if (!isAdmin(interaction)) return interaction.reply({ content: '\u274C Kein Zugriff!', flags: MessageFlags.Ephemeral });
      const target = interaction.options.getUser('spieler');
      const amount = interaction.options.getInteger('menge');
      const cur    = eco.get(target.id);
      const actual = Math.min(amount, cur);
      const newBal = eco.remove(target.id, actual);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle('\uD83D\uDCB8 Jetons abgezogen')
          .setDescription(
            `**${target.username}** hat **-${actual.toLocaleString('de-DE')} Jetons** verloren!\nNeues Guthaben: **${newBal.toLocaleString('de-DE')} Jetons**` +
            (actual < amount ? `\n\n\u26A0\uFE0F Nur ${actual.toLocaleString('de-DE')} verf\xFCgbar \u2013 alles abgezogen.` : '')
          )
          .setColor(0x00BFFF).setFooter({ text: `Abgezogen von: ${interaction.user.username} \u2022 The Diamond Casino Richman` }).setTimestamp()],
      });
    }

    if (cmd === 'delete') {
      if (!isAdmin(interaction)) return interaction.reply({ content: '\u274C Kein Zugriff!', flags: MessageFlags.Ephemeral });
      const amount = interaction.options.getInteger('menge');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const deleted = await interaction.channel.bulkDelete(amount, true);
        return interaction.editReply({ content: `\u2705 **${deleted.size}** Nachricht(en) gel\xF6scht.` });
      } catch (e) {
        return interaction.editReply({ content: `\u274C Fehler: ${e.message}` });
      }
    }

    if (cmd === 'slot-machine') {
      if (eco.get(interaction.user.id) < 1000)
        return interaction.reply({ content: '\uD83D\uDED2 Du brauchst mindestens **1.000 Jetons**!', flags: MessageFlags.Ephemeral });
      sessions.set(interaction.user.id, { bet: 0, spinning: false });
      return interaction.showModal(sm.buildModal(interaction.user.id));
    }

    if (cmd === 'inside-track') {
      if (eco.get(interaction.user.id) < 1000)
        return interaction.reply({ content: '\uD83D\uDED2 Du brauchst mindestens **1.000 Jetons**!', flags: MessageFlags.Ephemeral });
      return interaction.showModal(hr.buildModal(interaction.user.id));
    }

    if (cmd === 'blackjack') {
      if (eco.get(interaction.user.id) < 1000)
        return interaction.reply({ content: '\uD83D\uDED2 Du brauchst mindestens **1.000 Jetons**!', flags: MessageFlags.Ephemeral });
      return interaction.showModal(bj.buildModal(interaction.user.id));
    }
  }

  /* ═══════════════════════════════════════
     MODAL SUBMITS
  ═══════════════════════════════════════ */
  if (interaction.isModalSubmit()) {
    const { customId } = interaction;

    /* ── Slot Machine Modal ── */
    if (customId.startsWith('sm|modal|')) {
      const userId = customId.split('|')[2];
      if (interaction.user.id !== userId) return;
      const bet = sm.parseBet(interaction.fields.getTextInputValue('bet_amount'));
      if (isNaN(bet) || bet < 1000 || bet > 250000)
        return interaction.reply({ content: '\u274C Ung\xFCltiger Einsatz! Beispiel: `5000` oder `50K`', flags: MessageFlags.Ephemeral });
      const bal = eco.get(userId);
      if (bal < bet) return interaction.reply({ content: `\u274C Nicht genug Jetons! Du hast **${bal.toLocaleString('de-DE')}**.`, flags: MessageFlags.Ephemeral });
      sessions.set(userId, { bet, spinning: false });
      return await runSpin(interaction, userId, bet, true);
    }

    /* ── Horse Race Modal ── */
    if (customId.startsWith('hr|modal|')) {
      const userId = customId.split('|')[2];
      if (interaction.user.id !== userId) return;
      const bet = sm.parseBet(interaction.fields.getTextInputValue('bet_amount'));
      if (isNaN(bet) || bet < 1000 || bet > 250000)
        return interaction.reply({ content: '\u274C Ung\xFCltiger Einsatz!', flags: MessageFlags.Ephemeral });
      const bal = eco.get(userId);
      if (bal < bet) return interaction.reply({ content: `\u274C Nicht genug Jetons! Du hast **${bal.toLocaleString('de-DE')}**.`, flags: MessageFlags.Ephemeral });
      hrSessions.set(userId, { bet, running: false });
      return interaction.reply({ embeds: [hr.buildSelectEmbed(bet)], components: hr.selectRows(userId) });
    }

    /* ── Blackjack Host Modal (neues Spiel) ── */
    if (customId.startsWith('bj|modal|')) {
      const hostId = customId.split('|')[2];
      if (interaction.user.id !== hostId) return;
      const bet = sm.parseBet(interaction.fields.getTextInputValue('bet_amount'));
      if (isNaN(bet) || bet < 1000 || bet > 250000)
        return interaction.reply({ content: '\u274C Ung\xFCltiger Einsatz!', flags: MessageFlags.Ephemeral });
      const bal = eco.get(hostId);
      if (bal < bet) return interaction.reply({ content: `\u274C Nicht genug Jetons! Du hast **${bal.toLocaleString('de-DE')}**.`, flags: MessageFlags.Ephemeral });
      const session = bj.createSession(hostId, interaction.user.username, bet);
      bjSessions.set(hostId, session);
      await interaction.reply({ embeds: [bj.buildLobbyEmbed(session)], components: bj.lobbyButtons(hostId, false) });
      session.message = await interaction.fetchReply();
      return;
    }

    /* ── Blackjack Join Modal (Mitspieler) ── */
    if (customId.startsWith('bj|joinmodal|')) {
      const hostId = customId.split('|')[2];
      const session = bjSessions.get(hostId);
      if (!session || session.phase !== 'lobby')
        return interaction.reply({ content: '\u274C Diese Lobby existiert nicht mehr.', flags: MessageFlags.Ephemeral });
      if (session.players.find((p) => p.userId === interaction.user.id))
        return interaction.reply({ content: '\u274C Du bist bereits in der Lobby!', flags: MessageFlags.Ephemeral });
      const bet = sm.parseBet(interaction.fields.getTextInputValue('bet_amount'));
      if (isNaN(bet) || bet < 1000 || bet > 250000)
        return interaction.reply({ content: '\u274C Ung\xFCltiger Einsatz!', flags: MessageFlags.Ephemeral });
      const bal = eco.get(interaction.user.id);
      if (bal < bet) return interaction.reply({ content: `\u274C Nicht genug Jetons! Du hast **${bal.toLocaleString('de-DE')}**.`, flags: MessageFlags.Ephemeral });
      session.players.push(bj.createPlayer(interaction.user.id, interaction.user.username, bet));
      const full = session.players.length >= bj.MAX_PLAYERS;
      if (session.message) await session.message.edit({ embeds: [bj.buildLobbyEmbed(session)], components: bj.lobbyButtons(hostId, full) });
      return interaction.reply({ content: `\u2705 Du bist der Lobby beigetreten! Einsatz: **${bet.toLocaleString('de-DE')} Jetons**`, flags: MessageFlags.Ephemeral });
    }
  }

  /* ═══════════════════════════════════════
     BUTTONS
  ═══════════════════════════════════════ */
  if (interaction.isButton()) {
    const { customId } = interaction;

    /* ── Slot Machine Buttons ── */
    if (customId.startsWith('sm|')) {
      const parts   = customId.split('|');
      const action  = parts[1];
      const ownerId = parts[parts.length - 1];
      if (interaction.user.id !== ownerId)
        return interaction.reply({ content: '\u274C Das ist nicht deine Slot Machine!', flags: MessageFlags.Ephemeral });
      const session = sessions.get(ownerId);
      if (action === 'quit') {
        sessions.delete(ownerId);
        return interaction.update({
          embeds: [new EmbedBuilder().setTitle('\uD83C\uDFB0 Slot Machine beendet').setDescription(`\uD83C\uDFE6 Guthaben: **${eco.get(ownerId).toLocaleString('de-DE')} Jetons**\n\nBis zum n\xE4chsten Mal!`).setColor(0x00BFFF).setFooter({ text: 'The Diamond Casino Richman' })],
          components: [],
        });
      }
      if (action === 'changebeta') return interaction.showModal(sm.buildModal(ownerId));
      if (action === 'continue') {
        if (!session) return interaction.reply({ content: '\u274C Sitzung abgelaufen. Nutze `/slot-machine` neu.', flags: MessageFlags.Ephemeral });
        if (session.spinning) return interaction.reply({ content: '\u23F3 Dreht sich noch!', flags: MessageFlags.Ephemeral });
        await runSpin(interaction, ownerId, session.bet, false);
      }
      return;
    }

    /* ── Horse Race Buttons ── */
    if (customId.startsWith('hr|')) {
      const parts   = customId.split('|');
      const action  = parts[1];
      const ownerId = parts[parts.length - 1];
      if (interaction.user.id !== ownerId)
        return interaction.reply({ content: '\u274C Das ist nicht dein Rennen!', flags: MessageFlags.Ephemeral });
      const session = hrSessions.get(ownerId);
      if (action === 'quit') {
        hrSessions.delete(ownerId);
        return interaction.update({
          embeds: [new EmbedBuilder().setTitle('\uD83C\uDFB4 Inside Track beendet').setDescription(`\uD83C\uDFE6 Guthaben: **${eco.get(ownerId).toLocaleString('de-DE')} Jetons**\n\nBis zum n\xE4chsten Rennen!`).setColor(0x00BFFF).setFooter({ text: 'The Diamond Casino Richman \u2013 Inside Track' })],
          components: [],
        });
      }
      if (action === 'again') {
        hrSessions.set(ownerId, { bet: session?.bet ?? 1000, running: false });
        return interaction.showModal(hr.buildModal(ownerId));
      }
      if (action === 'pick') {
        if (!session || session.running)
          return interaction.reply({ content: '\u274C Kein aktives Rennen oder bereits gestartet.', flags: MessageFlags.Ephemeral });
        const horseId = parseInt(parts[2], 10);
        const pickedHorse = hr.HORSES[horseId];
        const { bet } = session;
        const bal = eco.get(ownerId);
        if (bal < bet)
          return interaction.update({ embeds: [new EmbedBuilder().setTitle('\uD83C\uDFB4 Inside Track').setDescription(`\u274C Nicht genug Jetons!`).setColor(0x00BFFF)], components: [] });
        session.running = true;
        await interaction.deferUpdate();
        const winner   = hr.pickWinner();
        const raceData = hr.simulateRace(winner.id);
        eco.remove(ownerId, bet);
        for (let f = 1; f <= 5; f++) {
          await interaction.editReply({ embeds: [hr.buildRaceEmbed(raceData, f, pickedHorse, bet)], components: [] });
          await sleep(1200);
        }
        const payout = winner.id === pickedHorse.id ? Math.floor(bet * pickedHorse.odds) : 0;
        if (payout > 0) eco.add(ownerId, payout);
        await interaction.editReply({ embeds: [hr.buildResultEmbed(raceData, winner, pickedHorse, bet, payout, eco.get(ownerId))], components: hr.endRow(ownerId) });
        session.running = false;
      }
      return;
    }

    /* ── Blackjack Buttons ── */
    if (customId.startsWith('bj|')) {
      const parts   = customId.split('|');
      const action  = parts[1];
      const hostId  = parts[2];
      const session = bjSessions.get(hostId);

      if (action === 'quit') {
        bjSessions.delete(hostId);
        return interaction.update({
          embeds: [new EmbedBuilder().setTitle('\uD83C\uDCCF Blackjack beendet').setDescription(`\uD83C\uDFE6 Bis zum n\xE4chsten Mal!`).setColor(0x00BFFF).setFooter({ text: 'The Diamond Casino Richman \u2013 Blackjack' })],
          components: [],
        });
      }

      if (action === 'again') {
        if (interaction.user.id !== hostId)
          return interaction.reply({ content: '\u274C Nur der Gastgeber kann ein neues Spiel starten.', flags: MessageFlags.Ephemeral });
        bjSessions.delete(hostId);
        if (eco.get(hostId) < 1000)
          return interaction.update({ embeds: [new EmbedBuilder().setTitle('\uD83C\uDCCF Blackjack').setDescription('\uD83D\uDED2 Nicht genug Jetons!').setColor(0x00BFFF)], components: [] });
        return interaction.showModal(bj.buildModal(hostId));
      }

      if (action === 'join') {
        if (!session || session.phase !== 'lobby')
          return interaction.reply({ content: '\u274C Diese Lobby ist nicht mehr aktiv.', flags: MessageFlags.Ephemeral });
        if (session.players.find((p) => p.userId === interaction.user.id))
          return interaction.reply({ content: '\u274C Du bist bereits dabei!', flags: MessageFlags.Ephemeral });
        if (session.players.length >= bj.MAX_PLAYERS)
          return interaction.reply({ content: '\u274C Die Lobby ist voll (max. 4 Spieler).', flags: MessageFlags.Ephemeral });
        if (eco.get(interaction.user.id) < 1000)
          return interaction.reply({ content: '\uD83D\uDED2 Du brauchst mindestens **1.000 Jetons**!', flags: MessageFlags.Ephemeral });
        return interaction.showModal(bj.buildJoinModal(hostId));
      }

      if (action === 'start') {
        if (interaction.user.id !== hostId)
          return interaction.reply({ content: '\u274C Nur der Gastgeber kann das Spiel starten.', flags: MessageFlags.Ephemeral });
        if (!session || session.phase !== 'lobby')
          return interaction.reply({ content: '\u274C Keine aktive Lobby.', flags: MessageFlags.Ephemeral });
        await interaction.deferUpdate();
        session.deck       = bj.createDeck();
        session.dealerHand = [session.deck.pop(), session.deck.pop()];
        for (const p of session.players) {
          eco.remove(p.userId, p.bet);
          p.hand = [session.deck.pop(), session.deck.pop()];
          if (bj.isBlackjack(p.hand)) { p.done = true; p.result = 'blackjack'; }
        }
        session.phase      = 'playing';
        session.currentIdx = 0;
        return await bjShowTurn(interaction, hostId);
      }

      if (!session || session.phase !== 'playing')
        return interaction.reply({ content: '\u274C Kein aktives Spiel.', flags: MessageFlags.Ephemeral });

      const currentPlayer = session.players[session.currentIdx];
      if (interaction.user.id !== currentPlayer.userId)
        return interaction.reply({ content: '\u274C Du bist nicht an der Reihe!', flags: MessageFlags.Ephemeral });

      await interaction.deferUpdate();

      if (action === 'hit') {
        currentPlayer.hand.push(session.deck.pop());
        const val = bj.handValue(currentPlayer.hand);
        if (val > 21) { currentPlayer.done = true; currentPlayer.result = 'bust'; return await bjNextTurn(interaction, hostId); }
        if (val === 21) { currentPlayer.done = true; return await bjNextTurn(interaction, hostId); }
        currentPlayer.canDouble = false;
        const canDbl = false;
        return interaction.editReply({ embeds: [bj.buildGameEmbed(session)], components: bj.actionButtons(hostId, canDbl) });
      }

      if (action === 'stand') {
        currentPlayer.done = true;
        return await bjNextTurn(interaction, hostId);
      }

      if (action === 'double') {
        const extra = currentPlayer.bet;
        if (eco.get(currentPlayer.userId) < extra)
          return interaction.editReply({ embeds: [bj.buildGameEmbed(session)], components: bj.actionButtons(hostId, false) });
        eco.remove(currentPlayer.userId, extra);
        currentPlayer.bet *= 2;
        currentPlayer.hand.push(session.deck.pop());
        currentPlayer.done = true;
        if (bj.handValue(currentPlayer.hand) > 21) currentPlayer.result = 'bust';
        return await bjNextTurn(interaction, hostId);
      }
    }
  }
});

/* ═══════════════════════════════════════
   BLACKJACK HELPERS
═══════════════════════════════════════ */
async function bjShowTurn(interaction, hostId) {
  const session = bjSessions.get(hostId);
  while (session.currentIdx < session.players.length && session.players[session.currentIdx].done)
    session.currentIdx++;
  if (session.currentIdx >= session.players.length) return await bjDealerPlay(interaction, hostId);
  const current = session.players[session.currentIdx];
  const canDbl  = current.hand.length === 2 && eco.get(current.userId) >= current.bet;
  return interaction.editReply({ embeds: [bj.buildGameEmbed(session)], components: bj.actionButtons(hostId, canDbl) });
}

async function bjNextTurn(interaction, hostId) {
  const session = bjSessions.get(hostId);
  session.currentIdx++;
  return await bjShowTurn(interaction, hostId);
}

async function bjDealerPlay(interaction, hostId) {
  const session = bjSessions.get(hostId);
  const { deck, dealerHand, players } = session;
  const anyAlive = players.some((p) => p.result !== 'bust' && p.result !== 'blackjack');
  if (anyAlive) while (bj.handValue(dealerHand) < 17) dealerHand.push(deck.pop());
  const dVal  = bj.handValue(dealerHand);
  const dBust = dVal > 21;
  for (const p of players) {
    if (p.result === 'bust') { p.payout = 0; continue; }
    if (p.result === 'blackjack') { p.payout = Math.floor(p.bet * 2.5); eco.add(p.userId, p.payout); continue; }
    const pVal = bj.handValue(p.hand);
    if (dBust || pVal > dVal)       { p.result = 'win';  p.payout = p.bet * 2; eco.add(p.userId, p.payout); }
    else if (pVal === dVal)          { p.result = 'push'; p.payout = p.bet;     eco.add(p.userId, p.payout); }
    else                             { p.result = 'loss'; p.payout = 0; }
  }
  session.phase = 'done';
  return interaction.editReply({ embeds: [bj.buildResultEmbed(session)], components: bj.endRow(hostId) });
}

/* ═══════════════════════════════════════
   SLOT MACHINE
═══════════════════════════════════════ */
async function runSpin(interaction, userId, bet, isModal) {
  if (isModal) await interaction.deferReply();
  else         await interaction.deferUpdate();
  const session = sessions.get(userId);
  if (session) session.spinning = true;
  const balBefore = eco.get(userId);
  if (balBefore < bet) {
    if (session) session.spinning = false;
    return interaction.editReply({ content: `\u274C Nicht genug Jetons! Du hast **${balBefore.toLocaleString('de-DE')}**.` });
  }
  eco.remove(userId, bet);
  const reels  = sm.spin(bet);
  const result = sm.calcWin(reels, bet);
  if (result.win > 0) eco.add(userId, result.win);
  const finalBal = eco.get(userId);
  try {
    await interaction.editReply({ embeds: [sm.buildSpinEmbed(reels, bet, balBefore, 0)], components: [] });
    await sleep(1300);
    await interaction.editReply({ embeds: [sm.buildSpinEmbed(reels, bet, balBefore, 1)], components: [] });
    await sleep(1300);
    await interaction.editReply({ embeds: [sm.buildSpinEmbed(reels, bet, balBefore, 2)], components: [] });
    await sleep(1300);
    await interaction.editReply({ embeds: [sm.buildResultEmbed(reels, bet, result, finalBal)], components: sm.gameRows(bet, finalBal, userId) });
  } catch (err) {
    console.error('[FEHLER] Slot-Animation:', err.message);
  }
  if (session) session.spinning = false;
}

client.login(TOKEN);
