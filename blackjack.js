const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');

const LIGHT_BLUE = 0x00BFFF;
const BRAND      = 'The Diamond Casino Richman \u2013 Blackjack';
const SUITS      = ['\u2660', '\u2665', '\u2666', '\u2663'];
const RANKS      = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

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

function formatHand(hand, hideSecond = false) {
  if (hideSecond && hand.length > 1)
    return `${hand[0].rank}${hand[0].suit} \uD83C\uDCCF`;
  return hand.map((c) => `${c.rank}${c.suit}`).join('  ');
}

function buildModal(userId) {
  const modal = new ModalBuilder()
    .setCustomId(`bj|modal|${userId}`)
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

function buildGameEmbed(playerHand, dealerHand, bet, balance, statusLine = '', hideDealer = true) {
  const pVal = handValue(playerHand);
  const dVal = hideDealer ? handValue([dealerHand[0]]) : handValue(dealerHand);
  const dStr = hideDealer ? `${formatHand(dealerHand, true)} (?)` : `${formatHand(dealerHand)} **(${dVal})**`;
  let desc =
    `\uD83C\uDFE6 Einsatz: **${bet.toLocaleString('de-DE')} Jetons** \u2014 Guthaben: **${balance.toLocaleString('de-DE')} Jetons**\n\n` +
    `\uD83E\uDD16 **Dealer:** ${dStr}\n` +
    `\uD83D\uDC64 **Du:** ${formatHand(playerHand)} **(${pVal})**`;
  if (statusLine) desc += `\n\n${statusLine}`;
  return new EmbedBuilder()
    .setTitle('\uD83C\uDCCF Blackjack \u2013 The Diamond Casino Richman')
    .setDescription(desc)
    .setColor(LIGHT_BLUE)
    .setFooter({ text: BRAND });
}

function gameButtons(userId, canDouble, balance, bet) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bj|hit|${userId}`).setLabel('\uD83C\uDCCF Karte nehmen').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`bj|stand|${userId}`).setLabel('\u270B Halten').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`bj|double|${userId}`)
      .setLabel('\uD83D\uDCB0 Verdoppeln')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!canDouble || balance < bet),
  )];
}

function endRow(userId) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bj|again|${userId}`).setLabel('\uD83D\uDD04 Nochmal spielen').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`bj|quit|${userId}`).setLabel('\u274C Beenden').setStyle(ButtonStyle.Danger),
  )];
}

module.exports = { createDeck, handValue, isBlackjack, formatHand, buildModal, buildGameEmbed, gameButtons, endRow };
