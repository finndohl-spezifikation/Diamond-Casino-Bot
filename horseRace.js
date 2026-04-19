const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');

const LIGHT_BLUE = 0x00BFFF;
const BRAND      = 'The Diamond Casino Richman \u2013 Inside Track';
const TRACK_LEN  = 10;

const HORSES = [
  { id: 0, name: 'Blitz',            odds: 2.0,  weight: 30, dot: '\uD83D\uDD34' },
  { id: 1, name: 'Donnerhuf',        odds: 3.0,  weight: 25, dot: '\uD83D\uDFE0' },
  { id: 2, name: 'Silberpfeil',      odds: 4.5,  weight: 20, dot: '\uD83D\uDFE1' },
  { id: 3, name: 'Sturmwind',        odds: 6.0,  weight: 15, dot: '\uD83D\uDFE2' },
  { id: 4, name: 'Mondlicht',        odds: 10.0, weight: 7,  dot: '\uD83D\uDD35' },
  { id: 5, name: 'Geisterj\xE4ger', odds: 20.0, weight: 3,  dot: '\uD83D\uDFE3' },
];

function pickWinner() {
  const total = HORSES.reduce((s, h) => s + h.weight, 0);
  let r = Math.random() * total;
  for (const h of HORSES) { r -= h.weight; if (r <= 0) return h; }
  return HORSES[0];
}

function simulateRace(winnerId) {
  return HORSES.map((_, i) => {
    const win  = i === winnerId;
    const pts  = [0];
    for (let f = 1; f <= 4; f++) {
      const prev = pts[f - 1];
      const inc  = win ? Math.random() * 0.23 + 0.16 : Math.random() * 0.21 + 0.12;
      pts.push(Math.min(win ? 0.95 : 0.88, prev + inc));
    }
    pts.push(win ? 1.0 : Math.min(0.93, pts[4] + 0.04 + Math.random() * 0.05));
    return pts;
  });
}

function trackLine(p, horse) {
  p = Math.min(1, Math.max(0, p));
  const pos  = Math.floor(p * TRACK_LEN);
  const done = p >= 1;
  const bar  = done
    ? '\u2591'.repeat(TRACK_LEN) + '\uD83C\uDFC1\uD83D\uDC0E'
    : '\u2591'.repeat(pos) + '\uD83D\uDC0E' + '\u2591'.repeat(TRACK_LEN - pos) + '\uD83C\uDFC1';
  return `${horse.dot}\`${bar}\` **${horse.name}**`;
}

function buildModal(userId) {
  const modal = new ModalBuilder()
    .setCustomId(`hr|modal|${userId}`)
    .setTitle('Inside Track \u2013 Einsatz w\xE4hlen');
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

function buildSelectEmbed(bet) {
  const lines = HORSES.map(h =>
    `${h.dot} **${h.name}** \u2014 Quote **x${h.odds.toFixed(1)}** \u2014 Gewinn: **${Math.floor(bet * h.odds).toLocaleString('de-DE')} Jetons**`
  ).join('\n');
  return new EmbedBuilder()
    .setTitle('\uD83C\uDFB4 Inside Track \u2013 W\xE4hle dein Pferd')
    .setDescription(`Einsatz: **${bet.toLocaleString('de-DE')} Jetons**\n\n${lines}\n\n\uD83D\uDC40 Klicke auf dein Pferd:`)
    .setColor(LIGHT_BLUE)
    .setFooter({ text: BRAND });
}

function selectRows(userId) {
  const r1 = new ActionRowBuilder();
  const r2 = new ActionRowBuilder();
  for (let i = 0; i < 3; i++)
    r1.addComponents(new ButtonBuilder().setCustomId(`hr|pick|${i}|${userId}`).setLabel(`${HORSES[i].name} x${HORSES[i].odds.toFixed(1)}`).setStyle(ButtonStyle.Primary));
  for (let i = 3; i < 6; i++)
    r2.addComponents(new ButtonBuilder().setCustomId(`hr|pick|${i}|${userId}`).setLabel(`${HORSES[i].name} x${HORSES[i].odds.toFixed(1)}`).setStyle(ButtonStyle.Primary));
  return [r1, r2];
}

function buildRaceEmbed(raceData, frame, pickedHorse, bet) {
  const track = HORSES.map((h, i) => trackLine(raceData[i][frame], h)).join('\n');
  return new EmbedBuilder()
    .setTitle('\uD83C\uDFB4 Inside Track \u2013 Rennen l\xE4uft!')
    .setDescription(
      `Dein Pferd: **${pickedHorse.name}** (x${pickedHorse.odds.toFixed(1)}) \u2014 Einsatz: **${bet.toLocaleString('de-DE')} Jetons**\n\n` +
      track + '\n\n\uD83C\uDFC1 Runde **' + frame + '/5**'
    )
    .setColor(LIGHT_BLUE)
    .setFooter({ text: BRAND });
}

function buildResultEmbed(raceData, winner, pickedHorse, bet, payout, finalBal) {
  const track = HORSES.map((h, i) => trackLine(raceData[i][5], h)).join('\n');
  const won = winner.id === pickedHorse.id;
  const result = won
    ? `\uD83C\uDFC6 **${winner.name} hat gewonnen! Gl\xFCckwunsch!**\n\uD83D\uDCB8 Gewinn: **+${payout.toLocaleString('de-DE')} Jetons**`
    : `\uD83D\uDC94 **${winner.name}** hat gewonnen. Du hattest auf **${pickedHorse.name}** gesetzt.\nVerlust: **-${bet.toLocaleString('de-DE')} Jetons**`;
  return new EmbedBuilder()
    .setTitle('\uD83C\uDFB4 Inside Track \u2013 Ergebnis')
    .setDescription(`${track}\n\n${result}\n\n\uD83C\uDFE6 **Guthaben:** ${finalBal.toLocaleString('de-DE')} Jetons`)
    .setColor(LIGHT_BLUE)
    .setFooter({ text: BRAND });
}

function endRow(userId) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`hr|again|${userId}`).setLabel('\uD83D\uDD04 Nochmal spielen').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`hr|quit|${userId}`).setLabel('\u274C Beenden').setStyle(ButtonStyle.Danger),
  )];
}

module.exports = { HORSES, pickWinner, simulateRace, buildModal, buildSelectEmbed, selectRows, buildRaceEmbed, buildResultEmbed, endRow };
