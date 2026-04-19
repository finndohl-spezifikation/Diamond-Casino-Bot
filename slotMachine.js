const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const SPIN_ICON = '\uD83C\uDF00';

const SYMBOLS = [
  { emoji: '\uD83C\uDF52', name: 'Kirsche',  weight: 30, mult: 2  },
  { emoji: '\uD83C\uDF4B', name: 'Zitrone',  weight: 25, mult: 3  },
  { emoji: '\uD83C\uDF4A', name: 'Orange',   weight: 20, mult: 4  },
  { emoji: '\uD83D\uDD14', name: 'Glocke',   weight: 15, mult: 5  },
  { emoji: '\u2B50',       name: 'Stern',    weight:  7, mult: 10 },
  { emoji: '\uD83D\uDC8E', name: 'Diamant',  weight:  2, mult: 25 },
  { emoji: '7\uFE0F\u20E3',name: 'Sieben',   weight:  1, mult: 50 },
];

function weighted() {
  const total = SYMBOLS.reduce((a, s) => a + s.weight, 0);
  let r = Math.random() * total;
  for (const s of SYMBOLS) { r -= s.weight; if (r <= 0) return s; }
  return SYMBOLS[0];
}

function spin() {
  return [weighted(), weighted(), weighted()];
}

function calcWin(reels, bet) {
  const [a, b, c] = reels;
  if (a.emoji === b.emoji && b.emoji === c.emoji)
    return { type: 'jackpot', symbol: a, win: bet * a.mult, mult: a.mult };
  if (a.emoji === b.emoji || b.emoji === c.emoji || a.emoji === c.emoji)
    return { type: 'pair', win: Math.floor(bet * 1.5), mult: 1.5 };
  return { type: 'lose', win: 0, mult: 0 };
}

const LINE = '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501';

function reelRow(reels, frame) {
  const r = (i) => frame > i ? reels[i].emoji : SPIN_ICON;
  return `\u2003${r(0)}\u3000\u2502\u3000${r(1)}\u3000\u2502\u3000${r(2)}`;
}

function machineSection(reels, frame) {
  return (
    LINE + '\n' +
    reelRow(reels, frame) + '\n' +
    LINE
  );
}

const QUESTION = { emoji: '\u2753' };

function buildBetEmbed(balance) {
  return new EmbedBuilder()
    .setTitle('\uD83C\uDFB0  G T A  R P  C A S I N O')
    .setDescription(
      '\uD83C\uDFAF **W\xE4hle deinen Einsatz!**\n\n' +
      machineSection([QUESTION, QUESTION, QUESTION], 3) +
      '\n\n\uD83C\uDFE6 **Guthaben:** ' + balance.toLocaleString('de-DE') + ' Jetons\n\n' +
      '\u26A1 **Gewinnm\xF6glichkeiten:**\n' +
      SYMBOLS.map(s => `${s.emoji} x3 \u2192 **x${s.mult}**`).join('  |  ')
    )
    .setColor(0xFFD700)
    .setFooter({ text: 'GTA RP Casino \u2022 Viel Gl\xFCck!' });
}

const SPIN_STATUS = [
  '\uD83C\uDF00 **Alle Rollen drehen sich...**',
  '\uD83D\uDFE2 Erste Rolle gestoppt!\n\uD83C\uDF00 **Noch am Drehen...**',
  '\uD83D\uDFE2 \uD83D\uDFE2 Zweite Rolle gestoppt!\n\uD83C\uDF00 **Letzte Rolle dreht...**',
];

function buildSpinEmbed(reels, bet, balance, frame) {
  return new EmbedBuilder()
    .setTitle('\uD83C\uDFB0  G T A  R P  C A S I N O')
    .setDescription(
      machineSection(reels, frame) + '\n\n' +
      SPIN_STATUS[frame] + '\n\n' +
      `\uD83D\uDCB0 **Einsatz:** ${bet.toLocaleString('de-DE')} Jetons\n` +
      `\uD83C\uDFE6 **Guthaben:** ${balance.toLocaleString('de-DE')} Jetons`
    )
    .setColor(0xFF8C00)
    .setFooter({ text: 'GTA RP Casino \u2022 Viel Gl\xFCck!' });
}

function buildResultEmbed(reels, bet, result, finalBalance) {
  let resultText, color;
  if (result.type === 'jackpot') {
    color = 0xFFD700;
    resultText =
      `\uD83C\uDF89 **JACKPOT! 3x ${result.symbol.name}!**\n` +
      `Multiplikator: **x${result.mult}**\n` +
      `\uD83D\uDCB8 Gewinn: **+${result.win.toLocaleString('de-DE')} Jetons**`;
  } else if (result.type === 'pair') {
    color = 0x00C853;
    resultText =
      `\uD83D\uDCB0 **Zwei Gleiche! Kleiner Gewinn!**\n` +
      `\uD83D\uDCB8 Gewinn: **+${result.win.toLocaleString('de-DE')} Jetons**`;
  } else {
    color = 0xFF3D00;
    resultText =
      `\uD83D\uDC94 **Leider nichts diesmal...**\n` +
      `Verlust: **-${bet.toLocaleString('de-DE')} Jetons**`;
  }
  return new EmbedBuilder()
    .setTitle('\uD83C\uDFB0  G T A  R P  C A S I N O  \u2013  Ergebnis')
    .setDescription(
      machineSection(reels, 3) + '\n\n' +
      resultText + '\n\n' +
      `\uD83C\uDFE6 **Neues Guthaben:** ${finalBalance.toLocaleString('de-DE')} Jetons`
    )
    .setColor(color)
    .setFooter({ text: 'GTA RP Casino \u2022 Weiterspielen?' });
}

function betRows(balance, userId) {
  const btn = (bet) => new ButtonBuilder()
    .setCustomId(`sm|bet|${bet}|${userId}`)
    .setLabel(`${bet} Jetons`)
    .setStyle(balance >= bet ? ButtonStyle.Primary : ButtonStyle.Secondary)
    .setDisabled(balance < bet);
  return [
    new ActionRowBuilder().addComponents(btn(10), btn(25), btn(50)),
    new ActionRowBuilder().addComponents(btn(100), btn(250), btn(500)),
  ];
}

function gameRows(bet, balance, userId) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`sm|continue|${userId}`)
      .setLabel(`\uD83D\uDD04 Weiterspielen (${bet} Jetons)`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(balance < bet),
    new ButtonBuilder()
      .setCustomId(`sm|changebeta|${userId}`)
      .setLabel('\uD83D\uDCB0 Einsatz \xE4ndern')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`sm|quit|${userId}`)
      .setLabel('\u274C Beenden')
      .setStyle(ButtonStyle.Danger),
  )];
}

module.exports = { spin, calcWin, buildBetEmbed, buildSpinEmbed, buildResultEmbed, betRows, gameRows };
