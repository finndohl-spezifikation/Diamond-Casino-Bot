const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');

const LIGHT_BLUE = 0x00BFFF;
const BRAND      = 'The Diamond Casino Richman \u2013 Blackjack';
const SUITS      = ['\u2660', '\u2665', '\u2666', '\u2663'];
const RANKS      = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const MAX_PLAYERS = 4;

function createDeck() {
  const deck = [];
  for (const suit of SUITS)
    for (const rank of RANKS) {
      const value = rank === 'A' ? 11 : ['J', 'Q', 'K'].includes(rank) ? 10 : parseInt(rank, 10);
      deck.push({ rank, suit, value });
    }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function handValue(hand) {
  let total = hand.reduce((s, c) => s + c.value, 0);
  let aces  = hand.filter((c) => c.rank === 'A').length;
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

function isBlackjack(hand) {
  return hand.length === 2 && handValue(hand) === 21;
}

function formatHand(hand) {
  return hand.map((c) => `${c.rank}${c.suit}`).join('\u2002');
}

function createPlayer(userId, username, bet) {
  return { userId, username, bet, hand: [], done: false, result: null, payout: 0 };
}

function createSession(hostId, hostUsername, hostBet) {
  return {
    hostId,
    phase: 'lobby',
    players: [createPlayer(hostId, hostUsername, hostBet)],
    deck: null,
    dealerHand: [],
    currentIdx: 0,
    message: null,
  };
}

function buildModal(hostId) {
  const modal = new ModalBuilder()
    .setCustomId(`bj|modal|${hostId}`)
    .setTitle('Blackjack \u2013 Einsatz w\xE4hlen');
  const inp = new TextInputBuilder()
    .setCustomId('bet_amount')
    .setLabel('Einsatz (1.000 \u2013 250.000 Jetons)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('z.B. 5000 oder 50K')
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(7);
  modal.addComponents(new ActionRowBuilder().addComponents(inp));
  return modal;
}

function buildJoinModal(hostId) {
  const modal = new ModalBuilder()
    .setCustomId(`bj|joinmodal|${hostId}`)
    .setTitle('Blackjack \u2013 Einsatz w\xE4hlen');
  const inp = new TextInputBuilder()
    .setCustomId('bet_amount')
    .setLabel('Dein Einsatz (1.000 \u2013 250.000 Jetons)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('z.B. 5000 oder 50K')
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(7);
  modal.addComponents(new ActionRowBuilder().addComponents(inp));
  return modal;
}

function buildLobbyEmbed(session) {
  const lines = session.players.map((p, i) =>
    `${i === 0 ? '\uD83D\uDC51' : '\uD83D\uDC64'} **${p.username}** \u2014 Einsatz: **${p.bet.toLocaleString('de-DE')} Jetons**`
  ).join('\n');
  return new EmbedBuilder()
    .setTitle('\uD83C\uDCCF Blackjack \u2013 Lobby')
    .setDescription(
      `**Spieler (${session.players.length}/${MAX_PLAYERS}):**\n${lines}\n\n` +
      (session.players.length < MAX_PLAYERS
        ? '\uD83D\uDC49 Klicke **Mitspielen** um beizutreten.\n'
        : '\uD83D\uDEAB Maximale Spieleranzahl erreicht.\n') +
      '\n\uD83D\uDC51 Der Gastgeber kann das Spiel jederzeit starten.'
    )
    .setColor(LIGHT_BLUE)
    .setFooter({ text: BRAND });
}

function lobbyButtons(hostId, full) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`bj|join|${hostId}`)
      .setLabel('\uD83D\uDC64 Mitspielen')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(full),
    new ButtonBuilder()
      .setCustomId(`bj|start|${hostId}`)
      .setLabel('\u25B6\uFE0F Spiel starten')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`bj|quit|${hostId}`)
      .setLabel('\u274C Abbrechen')
      .setStyle(ButtonStyle.Danger),
  )];
}

function buildGameEmbed(session) {
  const { players, currentIdx, dealerHand, phase } = session;
  const dStr = phase === 'done'
    ? `${formatHand(dealerHand)} **(${handValue(dealerHand)})**${handValue(dealerHand) > 21 ? ' \uD83D\uDCA5' : ''}`
    : `${dealerHand[0].rank}${dealerHand[0].suit} \uD83C\uDCCF (?)`;

  let desc = `\uD83E\uDD16 **Groupier:** ${dStr}\n\n`;
  for (let i = 0; i < players.length; i++) {
    const p    = players[i];
    const pVal = handValue(p.hand);
    let icon;
    if (p.done && p.result === 'bust')      icon = '\uD83D\uDCA5';
    else if (p.done)                         icon = '\u2705';
    else if (i === currentIdx)               icon = '\u25B6\uFE0F';
    else                                     icon = '\u23F3';
    const label = i === currentIdx && !p.done ? ' **\u2014 AN DER REIHE**' : '';
    desc += `${icon} **${p.username}** (${p.bet.toLocaleString('de-DE')} Jetons)${label}\n`;
    if (p.hand.length > 0) desc += `\u3000${formatHand(p.hand)} **(${pVal})**\n`;
    desc += '\n';
  }
  return new EmbedBuilder()
    .setTitle('\uD83C\uDCCF Blackjack \u2013 The Diamond Casino Richman')
    .setDescription(desc.trimEnd())
    .setColor(LIGHT_BLUE)
    .setFooter({ text: BRAND });
}

function actionButtons(hostId, canDouble) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bj|hit|${hostId}`).setLabel('\uD83C\uDCCF Karte nehmen').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`bj|stand|${hostId}`).setLabel('\u270B Halten').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`bj|double|${hostId}`)
      .setLabel('\uD83D\uDCB0 Verdoppeln')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!canDouble),
  )];
}

function buildResultEmbed(session) {
  const { players, dealerHand } = session;
  const dVal = handValue(dealerHand);
  let desc = `\uD83E\uDD16 **Groupier:** ${formatHand(dealerHand)} **(${dVal})**${dVal > 21 ? ' \u2014 \uD83D\uDCA5 \xDCberkauft!' : ''}\n\n`;
  for (const p of players) {
    const pVal = handValue(p.hand);
    let res;
    if (p.result === 'blackjack') res = `\uD83C\uDCCF\u2728 BLACKJACK! **+${(p.payout - p.bet).toLocaleString('de-DE')} Jetons**`;
    else if (p.result === 'win')  res = `\uD83C\uDFC6 Gewonnen! **+${p.bet.toLocaleString('de-DE')} Jetons**`;
    else if (p.result === 'push') res = `\uD83E\uDD1D Unentschieden \u2014 Einsatz zur\xFCck`;
    else if (p.result === 'bust') res = `\uD83D\uDCA5 \xDCberkauft! **-${p.bet.toLocaleString('de-DE')} Jetons**`;
    else                          res = `\uD83D\uDC94 Verloren! **-${p.bet.toLocaleString('de-DE')} Jetons**`;
    desc += `**${p.username}** \u2014 ${formatHand(p.hand)} **(${pVal})** \u2014 ${res}\n\n`;
  }
  return new EmbedBuilder()
    .setTitle('\uD83C\uDCCF Blackjack \u2013 Ergebnis')
    .setDescription(desc.trimEnd())
    .setColor(LIGHT_BLUE)
    .setFooter({ text: BRAND });
}

function endRow(hostId) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bj|again|${hostId}`).setLabel('\uD83D\uDD04 Nochmal spielen').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`bj|quit|${hostId}`).setLabel('\u274C Beenden').setStyle(ButtonStyle.Danger),
  )];
}

module.exports = {
  MAX_PLAYERS, createDeck, handValue, isBlackjack, formatHand,
  createPlayer, createSession,
  buildModal, buildJoinModal,
  buildLobbyEmbed, lobbyButtons,
  buildGameEmbed, actionButtons,
  buildResultEmbed, endRow,
};
