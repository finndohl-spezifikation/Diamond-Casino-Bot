require('dotenv').config();

const {
  Client, GatewayIntentBits, EmbedBuilder,
  REST, Routes, SlashCommandBuilder,
  MessageFlags, PermissionFlagsBits, PermissionsBitField,
  ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ButtonBuilder, ButtonStyle, ChannelType,
} = require('discord.js');

const eco         = require('./economy');
const sm          = require('./slotMachine');
const bj          = require('./blackjack');
const rl          = require('./roulette');
const pk          = require('./poker');
const memberStore = require('./memberStore');

const TOKEN      = process.env.DISCORD_TOKEN;
const CLIENT_ID  = process.env.CLIENT_ID;

/* ── Rollen ── */
const ADMIN_ROLE       = '1495237353529151528';
const AUTO_ROLE_1      = '1495238001922412684';
const AUTO_ROLE_2      = '1495238127021854751';
const TICKET_HANDLER_1 = '1495236780734156891';
const TICKET_HANDLER_2 = '1495236183062610081';
const VIP_ROLE         = '1495238055378817054';

/* ── Kanäle ── */
const WELCOME_CH    = '1495230944980897903';
const FAREWELL_CH   = '1495230977046216745';
const TICKET_CH     = '1495233961427734579';
const CH_ROULETTE   = '1495234739139772456';
const CH_BLACKJACK  = '1495234818810577018';
const CH_POKER      = '1495234770311974992';

const LIGHT_BLUE = 0x00BFFF;
const BRAND      = 'The Diamond Casino Richman';

if (!TOKEN)     { console.error('[FEHLER] DISCORD_TOKEN fehlt!'); process.exit(1); }
if (!CLIENT_ID) { console.error('[FEHLER] CLIENT_ID fehlt!');     process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bjSessions = new Map();
const rlSessions = new Map();
const pkSessions = new Map();

/* ── Ticket-Typen ── */
const TICKET_TYPES = {
  email:      { label: 'E-Mail schreiben',     emoji: '\uD83D\uDCE7', vipOnly: false, bewerbungOnly: false },
  vip:        { label: 'VIP Kontakt',           emoji: '\uD83D\uDC51', vipOnly: true,  bewerbungOnly: false },
  beschwerde: { label: 'Beschwerde Einreichen', emoji: '\u26A0\uFE0F', vipOnly: false, bewerbungOnly: false },
  penthouse:  { label: 'Penthouse Mieten',      emoji: '\uD83C\uDFD9\uFE0F', vipOnly: false, bewerbungOnly: false },
  abo:        { label: 'Abonnement Kaufen',     emoji: '\u2B50',       vipOnly: false, bewerbungOnly: false },
  bewerben:   { label: 'Bewerben',              emoji: '\uD83D\uDCDD', vipOnly: false, bewerbungOnly: true  },
};

/* ── Slash Commands ── */
const commands = [
  new SlashCommandBuilder().setName('jetons').setDescription('Zeigt deinen aktuellen Jetons-Stand'),

  new SlashCommandBuilder()
    .setName('jetons-give').setDescription('Gibt einem Spieler Jetons [Nur Staff]')
    .addUserOption((o) => o.setName('spieler').setDescription('Welchem Spieler?').setRequired(true))
    .addIntegerOption((o) => o.setName('menge').setDescription('Wie viele Jetons?').setRequired(true).setMinValue(1))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('jetons-remove').setDescription('Nimmt einem Spieler Jetons [Nur Staff]')
    .addUserOption((o) => o.setName('spieler').setDescription('Welchem Spieler?').setRequired(true))
    .addIntegerOption((o) => o.setName('menge').setDescription('Wie viele Jetons?').setRequired(true).setMinValue(1))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('delete').setDescription('L\xF6scht Nachrichten [Nur Staff]')
    .addIntegerOption((o) => o.setName('menge').setDescription('Wie viele? (1\u2013100)').setRequired(true).setMinValue(1).setMaxValue(100))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder().setName('roulette').setDescription('\uD83C\uDFB2 Spiele Roulette (bis zu 4 Spieler)'),
  new SlashCommandBuilder().setName('blackjack').setDescription('\uD83C\uDCCF Spiele Blackjack (bis zu 4 Spieler)'),
  new SlashCommandBuilder().setName('poker').setDescription('\uD83C\uDCCF Spiele 3-Karten Poker (bis zu 4 Spieler)'),

  new SlashCommandBuilder()
    .setName('setup-casino')
    .setDescription('Sendet das Casino Spielen-Embed [Nur Staff]')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
].map((c) => c.toJSON());

/* ── Hilfsfunktionen ── */
function isAdmin(interaction) {
  if (!interaction.guild) return false;
  if (interaction.guild.ownerId === interaction.user.id) return true;
  return interaction.member?.roles?.cache?.has(ADMIN_ROLE) ?? false;
}

function checkChannel(interaction, channelId) {
  if (interaction.channelId !== channelId) {
    interaction.reply({ content: `\u274C Dieser Command ist nur in <#${channelId}> verf\xFCgbar!`, flags: MessageFlags.Ephemeral });
    return false;
  }
  return true;
}

function buildTicketEmbed() {
  return new EmbedBuilder()
    .setTitle('\uD83C\uDFAB Kontakt-Aufnehmen \u2013 The Diamond Casino Richman')
    .setDescription(
      'Willkommen beim Support des **The Diamond Casino Richman**!\n\n' +
      'W\xE4hle unten eine Kategorie aus um ein Ticket zu \xF6ffnen.\n\n' +
      '\uD83D\uDCE7 **E-Mail schreiben** \u2013 Allgemeine Anfragen per E-Mail\n' +
      '\uD83D\uDC51 **VIP Kontakt** \u2013 Exklusiv f\xFCr VIP-Mitglieder\n' +
      '\u26A0\uFE0F **Beschwerde Einreichen** \u2013 Probleme melden\n' +
      '\uD83C\uDFD9\uFE0F **Penthouse Mieten** \u2013 Luxusunterkunft anfragen\n' +
      '\u2B50 **Abonnement Kaufen** \u2013 Premium-Mitgliedschaft\n' +
      '\uD83D\uDCDD **Bewerben** \u2013 Teil unseres Teams werden\n\n' +
      '_Unser Team ist so schnell wie m\xF6glich f\xFCr dich da._'
    )
    .setColor(LIGHT_BLUE)
    .setFooter({ text: BRAND })
    .setTimestamp();
}

function buildTicketSelectRow() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket|select')
    .setPlaceholder('\uD83D\uDCCB Kategorie ausw\xE4hlen...')
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel('E-Mail schreiben').setValue('email').setEmoji('\uD83D\uDCE7'),
      new StringSelectMenuOptionBuilder().setLabel('VIP Kontakt').setValue('vip').setEmoji('\uD83D\uDC51').setDescription('Nur f\xFCr VIP-Mitglieder'),
      new StringSelectMenuOptionBuilder().setLabel('Beschwerde Einreichen').setValue('beschwerde').setEmoji('\u26A0\uFE0F'),
      new StringSelectMenuOptionBuilder().setLabel('Penthouse Mieten').setValue('penthouse').setEmoji('\uD83C\uDFD9\uFE0F'),
      new StringSelectMenuOptionBuilder().setLabel('Abonnement Kaufen').setValue('abo').setEmoji('\u2B50'),
      new StringSelectMenuOptionBuilder().setLabel('Bewerben').setValue('bewerben').setEmoji('\uD83D\uDCDD'),
    );
  return new ActionRowBuilder().addComponents(menu);
}

async function createTicketChannel(guild, userId, username, type) {
  const ticketCh   = guild.channels.cache.get(TICKET_CH);
  const category   = ticketCh?.parent ?? null;
  const typeInfo   = TICKET_TYPES[type];
  const chName     = `ticket-${type}-${username.toLowerCase().replace(/[^a-z0-9]/g, '')}`.slice(0, 100);

  const perms = [
    { id: guild.id,         deny:  [PermissionsBitField.Flags.ViewChannel] },
    { id: userId,           allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
    { id: TICKET_HANDLER_2, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
  ];

  if (!typeInfo.bewerbungOnly)
    perms.push({ id: TICKET_HANDLER_1, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] });

  const ch = await guild.channels.create({
    name: chName,
    type: ChannelType.GuildText,
    parent: category?.id ?? null,
    permissionOverwrites: perms,
  });

  const embed = new EmbedBuilder()
    .setTitle(`${typeInfo.emoji} Ticket \u2013 ${typeInfo.label}`)
    .setDescription(
      `**Erstellt von:** <@${userId}>\n` +
      `**Kategorie:** ${typeInfo.label}\n\n` +
      'Unser Team wird sich so schnell wie m\xF6glich bei dir melden.\n\n' +
      '_Zum Schlie\xDFen des Tickets klicke den Button unten._'
    )
    .setColor(LIGHT_BLUE)
    .setFooter({ text: BRAND })
    .setTimestamp();

  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket|close|${ch.id}`).setLabel('\uD83D\uDD12 Ticket schlie\xDFen').setStyle(ButtonStyle.Danger)
  );

  await ch.send({ content: `<@${userId}>`, embeds: [embed], components: [closeRow] });
  return ch;
}

/* ══════════════════════════════════════
   CLIENT
══════════════════════════════════════ */
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once('clientReady', async () => {
  console.log(`[INFO] Bot online als: ${client.user.tag}`);

  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('[INFO] Slash Commands registriert!');
  } catch (e) {
    console.error('[FEHLER] Commands:', e.message);
  }

  /* Ticket-Embed einmalig senden (falls noch kein Bot-Embed vorhanden) */
  try {
    const guild = client.guilds.cache.first();
    if (guild) {
      const ch = guild.channels.cache.get(TICKET_CH);
      if (ch) {
        const msgs = await ch.messages.fetch({ limit: 10 });
        const alreadySent = msgs.some(
          (m) => m.author.id === client.user.id && m.components.length > 0
        );
        if (!alreadySent) {
          await ch.send({ embeds: [buildTicketEmbed()], components: [buildTicketSelectRow()] });
          console.log('[INFO] Ticket-Embed gesendet.');
        } else {
          console.log('[INFO] Ticket-Embed bereits vorhanden, \xFCbersprungen.');
        }
      }
    }
  } catch (e) {
    console.error('[FEHLER] Ticket-Embed:', e.message);
  }

  /* Casino-Embed einmalig senden (falls noch kein Bot-Embed vorhanden) */
  try {
    const guild = client.guilds.cache.first();
    if (guild) {
      const casinoUrl = process.env.CASINO_URL || 'https://diamond-casino-richman.replit.app';
      const casinoCh = guild.channels.cache.get('1495234695624134808');
      if (casinoCh) {
        const msgs = await casinoCh.messages.fetch({ limit: 10 });
        const alreadySent = msgs.some(
          (m) => m.author.id === client.user.id && m.components.length > 0
        );
        if (!alreadySent) {
          const casinoEmbed = new EmbedBuilder()
            .setTitle('🎰 Diamond Casino Richman')
            .setDescription(
              'Willkommen im **The Diamond Casino Richman** Online Casino!

' +
              '💰 Spiele unsere exklusiven Slot-Maschinen und gewinne Jetons!
' +
              '🏆 Dein Guthaben wird direkt mit deinem Discord-Konto synchronisiert.

' +
              '_Klicke auf **Spielen** – du wirst automatisch erkannt._'
            )
            .setColor(LIGHT_BLUE)
            .setFooter({ text: BRAND })
            .setTimestamp();
          const casinoRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel('Spielen').setStyle(ButtonStyle.Primary).setCustomId('casino|enter')
          );
          await casinoCh.send({ embeds: [casinoEmbed], components: [casinoRow] });
          console.log('[INFO] Casino-Embed gesendet.');
        } else {
          console.log('[INFO] Casino-Embed bereits vorhanden, uebersprungen.');
        }
      }
    }
  } catch (e) {
    console.error('[FEHLER] Casino-Embed:', e.message);
  }

});"


/* ══════════════════════════════════════
   MEMBER JOIN
══════════════════════════════════════ */
client.on('guildMemberAdd', async (member) => {
  const stored = memberStore.getMember(member.user.id);

  if (stored) {
    /* Wiederkehrendes Mitglied – Rollen + Jetons wiederherstellen */
    await eco.set(member.user.id, stored.jetons);
    for (const roleId of stored.roleIds) {
      await member.roles.add(roleId).catch(() => {});
    }
    memberStore.clearMember(member.user.id);
  } else {
    /* Neues Mitglied – Auto-Rollen vergeben */
    await member.roles.add(AUTO_ROLE_1).catch(() => {});
    await member.roles.add(AUTO_ROLE_2).catch(() => {});
  }

  /* DM-Willkommensnachricht */
  const dmEmbed = new EmbedBuilder()
    .setTitle('\uD83C\uDFB0 Willkommen im The Diamond Casino Richman!')
    .setDescription(
      `Hey **${member.user.username}**! \uD83C\uDF89\n\n` +
      'Wir freuen uns, dich in unserem exklusiven Casino begr\xFC\xDFen zu d\xFCrfen.\n\n' +
      '\uD83D\uDCB0 Spiele Slot Machines, Blackjack, Pferderennen und vieles mehr!\n' +
      '\uD83C\uDFC6 K\xE4mpfe um Jetons und werde der reichste Spieler im Casino.\n' +
      '\uD83D\uDCA5 Viel Gl\xFCck und genie\xDFe deinen Aufenthalt!\n\n' +
      '_The Diamond Casino Richman \u2013 Wo Gl\xFCck auf Luxus trifft._'
    )
    .setColor(LIGHT_BLUE)
    .setFooter({ text: BRAND })
    .setTimestamp();
  member.user.send({ embeds: [dmEmbed] }).catch(() => {});

  /* Willkommen-Kanal */
  const welcomeEmbed = new EmbedBuilder()
    .setTitle('\uD83C\uDF89 Willkommen!')
    .setDescription(
      `<@${member.user.id}> ist dem **The Diamond Casino Richman** beigetreten!\n\n` +
      '\uD83C\uDFB0 Viel Gl\xFCck an den Tischen! \uD83D\uDC8E'
    )
    .setColor(LIGHT_BLUE)
    .setThumbnail(member.user.displayAvatarURL())
    .setFooter({ text: BRAND })
    .setTimestamp();
  const welcomeCh = member.guild.channels.cache.get(WELCOME_CH);
  if (welcomeCh) welcomeCh.send({ embeds: [welcomeEmbed] }).catch(() => {});
});

/* ══════════════════════════════════════
   MEMBER LEAVE
══════════════════════════════════════ */
client.on('guildMemberRemove', async (member) => {
  /* Rollen + Jetons speichern */
  const roleIds = member.roles.cache
    .filter((r) => r.id !== member.guild.id && !r.managed)
    .map((r) => r.id);
  memberStore.saveMember(member.user.id, roleIds, await eco.get(member.user.id));

  /* Abschiedsnachricht */
  const farewellEmbed = new EmbedBuilder()
    .setTitle('\uD83D\uDEAA Auf Wiedersehen!')
    .setDescription(
      `**${member.user.username}** hat das Casino verlassen.\n\n` +
      '_Wir hoffen, dich bald wieder bei uns begr\xFC\xDFen zu d\xFCrfen!_ \uD83C\uDFB0'
    )
    .setColor(LIGHT_BLUE)
    .setThumbnail(member.user.displayAvatarURL())
    .setFooter({ text: BRAND })
    .setTimestamp();
  const farewellCh = member.guild.channels.cache.get(FAREWELL_CH);
  if (farewellCh) farewellCh.send({ embeds: [farewellEmbed] }).catch(() => {});
});

/* ══════════════════════════════════════
   INTERACTIONS
══════════════════════════════════════ */
client.on('interactionCreate', async (interaction) => {

  /* ─── SLASH COMMANDS ─── */
  if (interaction.isChatInputCommand()) {
    const cmd = interaction.commandName;

    if (cmd === 'jetons') {
      const bal = await eco.get(interaction.user.id);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle('\uD83C\uDFB0 Dein Jetons-Konto')
          .setDescription(`**${interaction.user.username}**, dein aktueller Kontostand:\n\n\uD83D\uDCB0 **${bal.toLocaleString('de-DE')} Jetons**`)
          .setColor(LIGHT_BLUE).setFooter({ text: BRAND }).setTimestamp()],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (cmd === 'jetons-give') {
      if (!isAdmin(interaction)) return interaction.reply({ content: '\u274C Kein Zugriff!', flags: MessageFlags.Ephemeral });
      const target = interaction.options.getUser('spieler');
      const amount = interaction.options.getInteger('menge');
      const newBal = await eco.add(target.id, amount);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle('\uD83D\uDCB8 Jetons hinzugef\xFCgt')
          .setDescription(`**${target.username}** hat **+${amount.toLocaleString('de-DE')} Jetons** erhalten!\nNeues Guthaben: **${newBal.toLocaleString('de-DE')} Jetons**`)
          .setColor(LIGHT_BLUE).setFooter({ text: `Vergeben von: ${interaction.user.username} \u2022 ${BRAND}` }).setTimestamp()],
      });
    }

    if (cmd === 'jetons-remove') {
      if (!isAdmin(interaction)) return interaction.reply({ content: '\u274C Kein Zugriff!', flags: MessageFlags.Ephemeral });
      const target = interaction.options.getUser('spieler');
      const amount = interaction.options.getInteger('menge');
      const cur    = await eco.get(target.id);
      const actual = Math.min(amount, cur);
      const newBal = await eco.remove(target.id, actual);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle('\uD83D\uDCB8 Jetons abgezogen')
          .setDescription(`**${target.username}** hat **-${actual.toLocaleString('de-DE')} Jetons** verloren!\nNeues Guthaben: **${newBal.toLocaleString('de-DE')} Jetons**` + (actual < amount ? `\n\n\u26A0\uFE0F Nur ${actual.toLocaleString('de-DE')} verf\xFCgbar.` : ''))
          .setColor(LIGHT_BLUE).setFooter({ text: `Abgezogen von: ${interaction.user.username} \u2022 ${BRAND}` }).setTimestamp()],
      });
    }

    if (cmd === 'delete') {
      if (!isAdmin(interaction)) return interaction.reply({ content: '\u274C Kein Zugriff!', flags: MessageFlags.Ephemeral });
      const amount = interaction.options.getInteger('menge');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const deleted = await interaction.channel.bulkDelete(amount, true);
        return interaction.editReply({ content: `\u2705 **${deleted.size}** Nachricht(en) gel\xF6scht.` });
      } catch (e) { return interaction.editReply({ content: `\u274C Fehler: ${e.message}` }); }
    }


    if (cmd === 'setup-casino') {
      if (!isAdmin(interaction)) return interaction.reply({ content: '\u274C Kein Zugriff!', flags: MessageFlags.Ephemeral });
      const casinoUrl = process.env.CASINO_URL || 'https://diamond-casino-richman.replit.app';
      const casinoEmbed = new EmbedBuilder()
        .setTitle('\uD83C\uDFB0 Diamond Casino Richman \u2013 Jetzt Online spielen!')
        .setDescription(
          'Willkommen im **The Diamond Casino Richman** Online Casino!\n\n' +
          '\uD83D\uDCB0 Spiele unsere exklusiven Slot-Maschinen und gewinne Jetons!\n' +
          '\uD83C\uDFC6 Dein Guthaben wird direkt mit dem Discord synchronisiert.\n\n' +
          '_Klicke auf **Spielen** um loszulegen._'
        )
        .setColor(LIGHT_BLUE)
        .setFooter({ text: BRAND })
        .setTimestamp();
      const casinoRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('Spielen').setStyle(ButtonStyle.Primary).setCustomId('casino|enter')
      );
      const casinoCh = interaction.guild?.channels.cache.get('1495234695624134808');
      if (!casinoCh) return interaction.reply({ content: '\u274C Casino-Kanal nicht gefunden!', flags: MessageFlags.Ephemeral });
      await casinoCh.send({ embeds: [casinoEmbed], components: [casinoRow] });
      return interaction.reply({ content: '\u2705 Casino-Embed gesendet!', flags: MessageFlags.Ephemeral });
    }

    if (cmd === 'roulette') {
      if (!checkChannel(interaction, CH_ROULETTE)) return;
      if (await eco.get(interaction.user.id) < 1000) return interaction.reply({ content: '\uD83D\uDED2 Mindestens **1.000 Jetons** n\xF6tig!', flags: MessageFlags.Ephemeral });
      return interaction.showModal(rl.buildModal(interaction.user.id));
    }

    if (cmd === 'poker') {
      if (!checkChannel(interaction, CH_POKER)) return;
      if (await eco.get(interaction.user.id) < 1000) return interaction.reply({ content: '\uD83D\uDED2 Mindestens **1.000 Jetons** n\xF6tig!', flags: MessageFlags.Ephemeral });
      return interaction.showModal(pk.buildModal(interaction.user.id));
    }

    if (cmd === 'blackjack') {
      if (!checkChannel(interaction, CH_BLACKJACK)) return;
      if (await eco.get(interaction.user.id) < 1000) return interaction.reply({ content: '\uD83D\uDED2 Mindestens **1.000 Jetons** n\xF6tig!', flags: MessageFlags.Ephemeral });
      return interaction.showModal(bj.buildModal(interaction.user.id));
    }
  }

  /* ─── MODAL SUBMITS ─── */
  if (interaction.isModalSubmit()) {
    const { customId } = interaction;

    if (customId.startsWith('bj|modal|')) {
      const hostId = customId.split('|')[2];
      if (interaction.user.id !== hostId) return;
      const bet = sm.parseBet(interaction.fields.getTextInputValue('bet_amount'));
      if (isNaN(bet) || bet < 1000 || bet > 250000) return interaction.reply({ content: '\u274C Ung\xFCltiger Einsatz!', flags: MessageFlags.Ephemeral });
      const bal = await eco.get(hostId);
      if (bal < bet) return interaction.reply({ content: `\u274C Nicht genug Jetons! Du hast **${bal.toLocaleString('de-DE')}**.`, flags: MessageFlags.Ephemeral });
      const session = bj.createSession(hostId, interaction.user.username, bet);
      bjSessions.set(hostId, session);
      await interaction.reply({ embeds: [bj.buildLobbyEmbed(session)], components: bj.lobbyButtons(hostId, false) });
      session.message = await interaction.fetchReply();
      return;
    }

    if (customId.startsWith('bj|joinmodal|')) {
      const hostId = customId.split('|')[2];
      const session = bjSessions.get(hostId);
      if (!session || session.phase !== 'lobby') return interaction.reply({ content: '\u274C Lobby nicht mehr aktiv.', flags: MessageFlags.Ephemeral });
      if (session.players.find((p) => p.userId === interaction.user.id)) return interaction.reply({ content: '\u274C Du bist bereits dabei!', flags: MessageFlags.Ephemeral });
      const bet = sm.parseBet(interaction.fields.getTextInputValue('bet_amount'));
      if (isNaN(bet) || bet < 1000 || bet > 250000) return interaction.reply({ content: '\u274C Ung\xFCltiger Einsatz!', flags: MessageFlags.Ephemeral });
      const bal = await eco.get(interaction.user.id);
      if (bal < bet) return interaction.reply({ content: `\u274C Nicht genug Jetons! Du hast **${bal.toLocaleString('de-DE')}**.`, flags: MessageFlags.Ephemeral });
      session.players.push(bj.createPlayer(interaction.user.id, interaction.user.username, bet));
      const full = session.players.length >= bj.MAX_PLAYERS;
      if (session.message) await session.message.edit({ embeds: [bj.buildLobbyEmbed(session)], components: bj.lobbyButtons(hostId, full) }).catch(() => {});
      return interaction.reply({ content: `\u2705 Beigetreten! Einsatz: **${bet.toLocaleString('de-DE')} Jetons**`, flags: MessageFlags.Ephemeral });
    }

    /* ── Roulette Host Modal ── */
    if (customId.startsWith('rl|modal|')) {
      const userId = customId.split('|')[2];
      if (interaction.user.id !== userId) return;
      const bet = sm.parseBet(interaction.fields.getTextInputValue('bet_amount'));
      if (isNaN(bet) || bet < 1000 || bet > 250000) return interaction.reply({ content: '\u274C Ung\xFCltiger Einsatz!', flags: MessageFlags.Ephemeral });
      const bal = await eco.get(userId);
      if (bal < bet) return interaction.reply({ content: `\u274C Nicht genug Jetons! Du hast **${bal.toLocaleString('de-DE')}**.`, flags: MessageFlags.Ephemeral });
      const session = rl.createSession(userId, interaction.user.username, bet);
      rlSessions.set(userId, session);
      await interaction.reply({ embeds: [rl.buildLobbyEmbed(session)], components: rl.lobbyButtons(userId, false, false) });
      session.message = await interaction.fetchReply();
      return interaction.followUp({ embeds: [rl.buildBetSelectEmbed(interaction.user.username, bet)], components: rl.betTypeRows(userId, userId), flags: MessageFlags.Ephemeral });
    }

    /* ── Roulette Join Modal ── */
    if (customId.startsWith('rl|joinmodal|')) {
      const hostId  = customId.split('|')[2];
      const session = rlSessions.get(hostId);
      if (!session || session.phase !== 'lobby') return interaction.reply({ content: '\u274C Lobby nicht mehr aktiv.', flags: MessageFlags.Ephemeral });
      if (session.players.find((p) => p.userId === interaction.user.id)) return interaction.reply({ content: '\u274C Du bist bereits dabei!', flags: MessageFlags.Ephemeral });
      const bet = sm.parseBet(interaction.fields.getTextInputValue('bet_amount'));
      if (isNaN(bet) || bet < 1000 || bet > 250000) return interaction.reply({ content: '\u274C Ung\xFCltiger Einsatz!', flags: MessageFlags.Ephemeral });
      const bal = await eco.get(interaction.user.id);
      if (bal < bet) return interaction.reply({ content: `\u274C Nicht genug Jetons! Du hast **${bal.toLocaleString('de-DE')}**.`, flags: MessageFlags.Ephemeral });
      session.players.push({ userId: interaction.user.id, username: interaction.user.username, bet, betType: null, number: null, ready: false });
      const full = session.players.length >= rl.MAX_PLAYERS;
      if (session.message) await session.message.edit({ embeds: [rl.buildLobbyEmbed(session)], components: rl.lobbyButtons(hostId, full, rl.allReady(session)) }).catch(() => {});
      await interaction.reply({ embeds: [rl.buildBetSelectEmbed(interaction.user.username, bet)], components: rl.betTypeRows(hostId, interaction.user.id), flags: MessageFlags.Ephemeral });
      return;
    }

    /* ── Roulette Zahl Modal ── */
    if (customId.startsWith('rl|zahlmodal|')) {
      const parts  = customId.split('|');
      const hostId = parts[2], userId = parts[3];
      if (interaction.user.id !== userId) return;
      const session = rlSessions.get(hostId);
      if (!session) return interaction.reply({ content: '\u274C Session abgelaufen.', flags: MessageFlags.Ephemeral });
      const num = parseInt(interaction.fields.getTextInputValue('zahl'), 10);
      if (isNaN(num) || num < 0 || num > 36) return interaction.reply({ content: '\u274C Zahl muss zwischen 0 und 36 liegen!', flags: MessageFlags.Ephemeral });
      const player = session.players.find((p) => p.userId === userId);
      if (!player) return interaction.reply({ content: '\u274C Spieler nicht gefunden.', flags: MessageFlags.Ephemeral });
      player.betType = 'zahl';
      player.number  = num;
      player.ready   = true;
      if (session.message) await session.message.edit({ embeds: [rl.buildLobbyEmbed(session)], components: rl.lobbyButtons(hostId, session.players.length >= rl.MAX_PLAYERS, rl.allReady(session)) }).catch(() => {});
      return interaction.reply({ content: `\u2705 Du setzt auf die **${num}**!`, flags: MessageFlags.Ephemeral });
    }

    /* ── Poker Host Modal ── */
    if (customId.startsWith('pk|modal|')) {
      const userId = customId.split('|')[2];
      if (interaction.user.id !== userId) return;
      const bet = sm.parseBet(interaction.fields.getTextInputValue('bet_amount'));
      if (isNaN(bet) || bet < 1000 || bet > 250000) return interaction.reply({ content: '\u274C Einsatz muss zwischen **1.000** und **250.000** Jetons liegen!', flags: MessageFlags.Ephemeral });
      const bal = await eco.get(userId);
      if (bal < bet) return interaction.reply({ content: `\u274C Nicht genug Jetons! Du hast **${bal.toLocaleString('de-DE')}**.`, flags: MessageFlags.Ephemeral });
      const session = pk.createSession(userId, interaction.user.username, bet);
      pkSessions.set(userId, session);
      await interaction.reply({ embeds: [pk.buildLobbyEmbed(session)], components: pk.lobbyButtons(userId, false) });
      session.message = await interaction.fetchReply();
      return;
    }

    /* ── Poker Join Modal ── */
    if (customId.startsWith('pk|joinmodal|')) {
      const hostId  = customId.split('|')[2];
      const session = pkSessions.get(hostId);
      if (!session || session.phase !== 'lobby') return interaction.reply({ content: '\u274C Lobby nicht mehr aktiv.', flags: MessageFlags.Ephemeral });
      if (session.players.find((p) => p.userId === interaction.user.id)) return interaction.reply({ content: '\u274C Du bist bereits dabei!', flags: MessageFlags.Ephemeral });
      const bet = sm.parseBet(interaction.fields.getTextInputValue('bet_amount'));
      if (isNaN(bet) || bet < 1000 || bet > 250000) return interaction.reply({ content: '\u274C Einsatz muss zwischen **1.000** und **250.000** Jetons liegen!', flags: MessageFlags.Ephemeral });
      const bal = await eco.get(interaction.user.id);
      if (bal < bet) return interaction.reply({ content: `\u274C Nicht genug Jetons! Du hast **${bal.toLocaleString('de-DE')}**.`, flags: MessageFlags.Ephemeral });
      session.players.push(pk.createPlayer(interaction.user.id, interaction.user.username, bet));
      const full = session.players.length >= pk.MAX_PLAYERS;
      if (session.message) await session.message.edit({ embeds: [pk.buildLobbyEmbed(session)], components: pk.lobbyButtons(hostId, full) }).catch(() => {});
      return interaction.reply({ content: `\u2705 Beigetreten! Einsatz: **${bet.toLocaleString('de-DE')} Jetons**`, flags: MessageFlags.Ephemeral });
    }
  }

  /* ─── SELECT MENU ─── */
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'ticket|select') {
      const type    = interaction.values[0];
      const typeInfo = TICKET_TYPES[type];
      if (!typeInfo) return interaction.reply({ content: '\u274C Ung\xFCltige Auswahl.', flags: MessageFlags.Ephemeral });

      /* VIP-Pr\xFCfung */
      if (typeInfo.vipOnly && !interaction.member?.roles?.cache?.has(VIP_ROLE))
        return interaction.reply({ content: '\uD83D\uDC51 Diese Option ist nur f\xFCr **VIP-Mitglieder** verf\xFCgbar!', flags: MessageFlags.Ephemeral });

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const ch = await createTicketChannel(interaction.guild, interaction.user.id, interaction.user.username, type);
        return interaction.editReply({ content: `\u2705 Dein Ticket wurde erstellt: <#${ch.id}>` });
      } catch (e) {
        console.error('[TICKET FEHLER]', e.message);
        return interaction.editReply({ content: '\u274C Ticket konnte nicht erstellt werden.' });
      }
    }
  }

  /* ─── BUTTONS ─── */
  if (interaction.isButton()) {
    const { customId } = interaction;

    /* Ticket schlie\xDFen */
    if (customId.startsWith('ticket|close|')) {
      const hasRole = interaction.member?.roles?.cache?.has(TICKET_HANDLER_1) || interaction.member?.roles?.cache?.has(TICKET_HANDLER_2);
      const chId    = customId.split('|')[2];
      const ch      = interaction.guild.channels.cache.get(chId);
      if (!hasRole && interaction.channelId !== chId)
        return interaction.reply({ content: '\u274C Nur Staff kann Tickets schlie\xDFen!', flags: MessageFlags.Ephemeral });
      await interaction.reply({ content: '\uD83D\uDD12 Ticket wird geschlossen...' });
      await sleep(2000);
      if (ch) ch.delete().catch(() => {});
      return;
    }

    /* ── Blackjack ── */
    if (customId.startsWith('bj|')) {
      const parts = customId.split('|'), action = parts[1], hostId = parts[2];
      const session = bjSessions.get(hostId);

      if (action === 'quit') { bjSessions.delete(hostId); return interaction.update({ embeds: [new EmbedBuilder().setTitle('\uD83C\uDCCF Blackjack beendet').setDescription('\uD83C\uDFE6 Bis zum n\xE4chsten Mal!').setColor(LIGHT_BLUE).setFooter({ text: BRAND })], components: [] }); }

      if (action === 'again') {
        if (interaction.user.id !== hostId) return interaction.reply({ content: '\u274C Nur der Gastgeber kann neu starten.', flags: MessageFlags.Ephemeral });
        bjSessions.delete(hostId);
        if (await eco.get(hostId) < 1000) return interaction.update({ embeds: [new EmbedBuilder().setTitle('\uD83C\uDCCF Blackjack').setDescription('\uD83D\uDED2 Nicht genug Jetons!').setColor(LIGHT_BLUE)], components: [] });
        return interaction.showModal(bj.buildModal(hostId));
      }

      if (action === 'join') {
        if (!session || session.phase !== 'lobby') return interaction.reply({ content: '\u274C Lobby nicht mehr aktiv.', flags: MessageFlags.Ephemeral });
        if (session.players.find((p) => p.userId === interaction.user.id)) return interaction.reply({ content: '\u274C Du bist bereits dabei!', flags: MessageFlags.Ephemeral });
        if (session.players.length >= bj.MAX_PLAYERS) return interaction.reply({ content: '\u274C Lobby ist voll!', flags: MessageFlags.Ephemeral });
        if (await eco.get(interaction.user.id) < 1000) return interaction.reply({ content: '\uD83D\uDED2 Mindestens 1.000 Jetons n\xF6tig!', flags: MessageFlags.Ephemeral });
        return interaction.showModal(bj.buildJoinModal(hostId));
      }

      if (action === 'start') {
        if (interaction.user.id !== hostId) return interaction.reply({ content: '\u274C Nur der Gastgeber kann starten.', flags: MessageFlags.Ephemeral });
        if (!session || session.phase !== 'lobby') return interaction.reply({ content: '\u274C Keine aktive Lobby.', flags: MessageFlags.Ephemeral });
        await interaction.deferUpdate();
        session.deck = bj.createDeck();
        session.dealerHand = [session.deck.pop(), session.deck.pop()];
        for (const p of session.players) { await eco.remove(p.userId, p.bet); p.hand = [session.deck.pop(), session.deck.pop()]; if (bj.isBlackjack(p.hand)) { p.done = true; p.result = 'blackjack'; } }
        session.phase = 'playing'; session.currentIdx = 0;
        return await bjShowTurn(interaction, hostId);
      }

      if (!session || session.phase !== 'playing') return interaction.reply({ content: '\u274C Kein aktives Spiel.', flags: MessageFlags.Ephemeral });
      const current = session.players[session.currentIdx];
      if (interaction.user.id !== current.userId) return interaction.reply({ content: '\u274C Du bist nicht an der Reihe!', flags: MessageFlags.Ephemeral });
      await interaction.deferUpdate();

      if (action === 'hit') {
        current.hand.push(session.deck.pop());
        const val = bj.handValue(current.hand);
        if (val > 21) { current.done = true; current.result = 'bust'; return await bjNextTurn(interaction, hostId); }
        if (val === 21) { current.done = true; return await bjNextTurn(interaction, hostId); }
        return interaction.editReply({ embeds: [bj.buildGameEmbed(session)], components: bj.actionButtons(hostId, false) });
      }
      if (action === 'stand') { current.done = true; return await bjNextTurn(interaction, hostId); }
      if (action === 'double') {
        if (await eco.get(current.userId) < current.bet) return interaction.editReply({ embeds: [bj.buildGameEmbed(session)], components: bj.actionButtons(hostId, false) });
        await eco.remove(current.userId, current.bet);
        current.bet *= 2;
        current.hand.push(session.deck.pop());
        current.done = true;
        if (bj.handValue(current.hand) > 21) current.result = 'bust';
        return await bjNextTurn(interaction, hostId);
      }
    }

    /* ══ ROULETTE BUTTONS ══ */
    if (customId.startsWith('rl|')) {
      const parts  = customId.split('|');
      const action = parts[1];

      /* Bet type selection (ephemeral message) */
      if (action === 'bet') {
        const type = parts[2], hostId = parts[3], userId = parts[4];
        if (interaction.user.id !== userId) return interaction.reply({ content: '\u274C Nicht dein Bet!', flags: MessageFlags.Ephemeral });
        const session = rlSessions.get(hostId);
        if (!session) return interaction.update({ content: '\u274C Session abgelaufen.', embeds: [], components: [] });
        const player = session.players.find((p) => p.userId === userId);
        if (!player) return interaction.update({ content: '\u274C Spieler nicht gefunden.', embeds: [], components: [] });
        player.betType = type; player.ready = true;
        if (session.message) await session.message.edit({ embeds: [rl.buildLobbyEmbed(session)], components: rl.lobbyButtons(hostId, session.players.length >= rl.MAX_PLAYERS, rl.allReady(session)) }).catch(() => {});
        return interaction.update({ embeds: [new EmbedBuilder().setTitle('\u2705 Wette gesetzt!').setDescription(`Du setzt auf **${rl.BET_TYPES[type].label}** f\xFCr **${player.bet.toLocaleString('de-DE')} Jetons**.\nWarte auf den Gastgeber.`).setColor(LIGHT_BLUE).setFooter({ text: BRAND })], components: [] });
      }

      if (action === 'betzahl') {
        const hostId = parts[2], userId = parts[3];
        if (interaction.user.id !== userId) return interaction.reply({ content: '\u274C Nicht dein Bet!', flags: MessageFlags.Ephemeral });
        return interaction.showModal(rl.buildZahlModal(hostId, userId));
      }

      const hostId  = parts[2];
      const session = rlSessions.get(hostId);

      if (action === 'quit') {
        rlSessions.delete(hostId);
        return interaction.update({ embeds: [new EmbedBuilder().setTitle('\uD83C\uDFB2 Roulette beendet').setDescription('\uD83C\uDFE6 Bis zum n\xE4chsten Mal!').setColor(LIGHT_BLUE).setFooter({ text: BRAND })], components: [] });
      }

      if (action === 'join') {
        if (!session || session.phase !== 'lobby') return interaction.reply({ content: '\u274C Lobby nicht mehr aktiv.', flags: MessageFlags.Ephemeral });
        if (session.players.find((p) => p.userId === interaction.user.id)) return interaction.reply({ content: '\u274C Du bist bereits dabei!', flags: MessageFlags.Ephemeral });
        if (session.players.length >= rl.MAX_PLAYERS) return interaction.reply({ content: '\u274C Lobby ist voll!', flags: MessageFlags.Ephemeral });
        return interaction.showModal(rl.buildJoinModal(hostId));
      }

      if (action === 'again') {
        rlSessions.delete(hostId);
        if (interaction.user.id !== hostId) return interaction.reply({ content: '\u274C Nur der Gastgeber kann neu starten.', flags: MessageFlags.Ephemeral });
        if (await eco.get(hostId) < 1000) return interaction.update({ embeds: [new EmbedBuilder().setTitle('\uD83C\uDFB2 Roulette').setDescription('\uD83D\uDED2 Nicht genug Jetons!').setColor(LIGHT_BLUE)], components: [] });
        return interaction.showModal(rl.buildModal(hostId));
      }

      if (action === 'spin') {
        if (interaction.user.id !== hostId) return interaction.reply({ content: '\u274C Nur der Gastgeber kann drehen!', flags: MessageFlags.Ephemeral });
        if (!session || !rl.allReady(session)) return interaction.reply({ content: '\u274C Noch nicht alle Spieler bereit!', flags: MessageFlags.Ephemeral });
        await interaction.deferUpdate();
        const result = rl.spin();
        session.result = result;
        /* Jetons berechnen */
        for (const p of session.players) {
          const bt   = rl.BET_TYPES[p.betType];
          const won  = p.betType === 'zahl' ? p.number === result : bt.check(result);
          await eco.remove(p.userId, p.bet);
          p.payout = won ? p.bet * bt.payout : 0;
          if (p.payout > 0) await eco.add(p.userId, p.payout);
        }
        session.phase = 'done';
        /* Kurze Spin-Animation */
        for (let i = 0; i < 4; i++) {
          const rand = rl.spin();
          const col  = rl.getColor(rand);
          const ce   = col === 'green' ? '\uD83D\uDFE2' : col === 'red' ? '\uD83D\uDD34' : '\u26AB';
          await interaction.editReply({ embeds: [new EmbedBuilder().setTitle(`\uD83C\uDFB2 Das Rad dreht sich... ${ce} **${rand}**`).setColor(LIGHT_BLUE)], components: [] });
          await sleep(700);
        }
        return interaction.editReply({ embeds: [rl.buildResultEmbed(session)], components: rl.endRow(hostId) });
      }
    }

    /* ══ POKER BUTTONS ══ */
    if (customId.startsWith('pk|')) {
      const parts  = customId.split('|');
      const action = parts[1];
      const hostId = parts[2];
      const session = pkSessions.get(hostId);

      if (action === 'quit') {
        pkSessions.delete(hostId);
        return interaction.update({ embeds: [new EmbedBuilder().setTitle('\uD83C\uDCCF Poker beendet').setDescription('\uD83C\uDFE6 Bis zum n\xE4chsten Mal!').setColor(LIGHT_BLUE).setFooter({ text: BRAND })], components: [] });
      }

      if (action === 'again') {
        pkSessions.delete(hostId);
        if (interaction.user.id !== hostId) return interaction.reply({ content: '\u274C Nur der Gastgeber kann neu starten.', flags: MessageFlags.Ephemeral });
        if (await eco.get(hostId) < 1000) return interaction.update({ embeds: [new EmbedBuilder().setTitle('\uD83C\uDCCF Poker').setDescription('\uD83D\uDED2 Nicht genug Jetons!').setColor(LIGHT_BLUE)], components: [] });
        return interaction.showModal(pk.buildModal(hostId));
      }

      if (action === 'join') {
        if (!session || session.phase !== 'lobby') return interaction.reply({ content: '\u274C Lobby nicht mehr aktiv.', flags: MessageFlags.Ephemeral });
        if (session.players.find((p) => p.userId === interaction.user.id)) return interaction.reply({ content: '\u274C Du bist bereits dabei!', flags: MessageFlags.Ephemeral });
        if (session.players.length >= pk.MAX_PLAYERS) return interaction.reply({ content: '\u274C Lobby ist voll!', flags: MessageFlags.Ephemeral });
        if (await eco.get(interaction.user.id) < 1000) return interaction.reply({ content: '\uD83D\uDED2 Mindestens 1.000 Jetons n\xF6tig!', flags: MessageFlags.Ephemeral });
        return interaction.showModal(pk.buildJoinModal(hostId));
      }

      if (action === 'start') {
        if (interaction.user.id !== hostId) return interaction.reply({ content: '\u274C Nur der Gastgeber kann starten.', flags: MessageFlags.Ephemeral });
        if (!session || session.phase !== 'lobby') return interaction.reply({ content: '\u274C Keine aktive Lobby.', flags: MessageFlags.Ephemeral });
        await interaction.deferUpdate();
        session.deck = pk.createDeck();
        for (const p of session.players) {
          await eco.remove(p.userId, p.bet);
          p.hand = [session.deck.pop(), session.deck.pop(), session.deck.pop()];
        }
        session.phase = 'playing';
        return interaction.editReply({ embeds: [pk.buildDealtEmbed(session)], components: pk.revealButton(hostId) });
      }

      if (!session) return interaction.reply({ content: '\u274C Kein aktives Spiel.', flags: MessageFlags.Ephemeral });
      await interaction.deferUpdate();

      if (action === 'showdown') {
        session.phase = 'done';
        const pot = session.players.reduce((s, p) => s + p.bet, 0);
        let bestScore = null;
        for (const p of session.players) p._score = pk.evalThree(p.hand);
        for (const p of session.players) {
          if (!bestScore || pk.cmpScore(p._score, bestScore) > 0) bestScore = p._score;
        }
        const winners = session.players.filter((p) => pk.cmpScore(p._score, bestScore) === 0);
        const splitPot = Math.floor(pot / winners.length);
        for (const p of session.players) {
          if (winners.find((w) => w.userId === p.userId)) { p.payout = splitPot; await eco.add(p.userId, splitPot); }
          else { p.payout = 0; }
        }
        return interaction.editReply({ embeds: [pk.buildShowdownEmbed(session)], components: pk.endRow(hostId) });
      }
    }
  }
});

/* ══════════════════════════════════════
   BLACKJACK HELPERS
══════════════════════════════════════ */
async function bjShowTurn(interaction, hostId) {
  const session = bjSessions.get(hostId);
  while (session.currentIdx < session.players.length && session.players[session.currentIdx].done) session.currentIdx++;
  if (session.currentIdx >= session.players.length) return await bjDealerPlay(interaction, hostId);
  const current = session.players[session.currentIdx];
  const canDbl  = current.hand.length === 2 && await eco.get(current.userId) >= current.bet;
  return interaction.editReply({ embeds: [bj.buildGameEmbed(session)], components: bj.actionButtons(hostId, canDbl) });
}
async function bjNextTurn(interaction, hostId) { const s = bjSessions.get(hostId); s.currentIdx++; return await bjShowTurn(interaction, hostId); }
async function bjDealerPlay(interaction, hostId) {
  const session = bjSessions.get(hostId);
  const { deck, dealerHand, players } = session;
  if (players.some((p) => p.result !== 'bust' && p.result !== 'blackjack')) while (bj.handValue(dealerHand) < 17) dealerHand.push(deck.pop());
  const dVal = bj.handValue(dealerHand), dBust = dVal > 21;
  for (const p of players) {
    if (p.result === 'bust') { p.payout = 0; continue; }
    if (p.result === 'blackjack') { p.payout = Math.floor(p.bet * 2.5); await eco.add(p.userId, p.payout); continue; }
    const pVal = bj.handValue(p.hand);
    if (dBust || pVal > dVal)  { p.result = 'win';  p.payout = p.bet * 2; await eco.add(p.userId, p.payout); }
    else if (pVal === dVal)     { p.result = 'push'; p.payout = p.bet;     await eco.add(p.userId, p.payout); }
    else                        { p.result = 'loss'; p.payout = 0; }
  }
  session.phase = 'done';
  return interaction.editReply({ embeds: [bj.buildResultEmbed(session)], components: bj.endRow(hostId) });
}


client.login(TOKEN);
