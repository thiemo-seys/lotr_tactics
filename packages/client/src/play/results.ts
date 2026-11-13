// A round's results on the play page (docs/game-spec.md section 12): the person's outcome, then
// what the round did to them, the hit their HP took and the gold coming in, played out once as the
// results open, then everyone who took damage or was knocked out. The numbers come from
// PlayFlow.results; this module only draws and animates them.

import { PLAYER } from '@lotr-tactics/sim';
import type { RoundRecord } from '@lotr-tactics/server';
import { coinValues, ordinal, type IncomeLine, type IncomeSource, type PlayFlow, type RoundChange, type RoundResults } from '../flow.js';
import { ROUND_ICONS, type IconName } from '../icons.js';
import { textTip } from '../tips.js';
import { el, icon, rebuild, show } from '../ui/dom.js';
import { setTip } from '../ui/tooltip.js';

const ROUND_NAMES = { council: 'Council of Elrond', pvp: 'PvP', pve: 'PvE' } as const;
const OUTCOME_ICONS: Readonly<Record<RoundResults['outcome'], IconName>> = { Victory: 'trophy', Defeat: 'knockout', Draw: 'pvp', 'No fight': 'council' };
const SOURCE_ICONS: Readonly<Record<IncomeSource, IconName>> = {
  win: 'trophy',
  winStreak: 'streak-win',
  lossStreak: 'streak-loss',
  loot: 'pve',
  rings: 'ring-of-power',
  interest: 'level-up',
  base: 'coin',
};

/** When the HP's hit lands, and when the coins start, in milliseconds after the results open. */
const HIT_AT = 200;
const COINS_AT = { hurt: 950, unhurt: 650 } as const;
/** How long the coins take to leave, all of them, and how long each flies for. */
const COIN_STREAM_MS = 1500;
const COIN_FLIGHT_MS = 520;

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

/** The parts of the panel the animation moves. */
interface Parts {
  readonly emblem: HTMLElement;
  readonly ring: HTMLElement;
  readonly flash: HTMLElement;
  readonly hp: HTMLElement;
  readonly float: HTMLElement;
  readonly sources: readonly HTMLElement[];
  readonly bag: HTMLElement | null;
  readonly purse: HTMLElement | null;
  readonly gained: HTMLElement | null;
}

export function renderResults(panel: HTMLElement, flow: PlayFlow, round: RoundRecord, waiting: boolean): void {
  const r = flow.results(round, waiting);
  const seats = flow.lobby?.seats;
  // Waiting doesn't build the panel again, so the animation plays once.
  const key = JSON.stringify(['results', { ...r, waiting: undefined }, seats?.map((s) => s.kind)]);
  rebuild(panel, key, () => {
    panel.className = `panel results outcome-${r.outcome.toLowerCase().replace(' ', '-')}`;
    const { nodes, parts } = build(r, flow);
    // The results open with the animation; a page that comes to them later, or asks for less motion, shows how they end.
    if (!waiting && !reducedMotion.matches) {
      prepare(parts, r.change);
      requestAnimationFrame(() => animate(panel, key, parts, r.change));
    }
    return nodes;
  });
  const waitingNote = panel.querySelector<HTMLElement>('.waiting');
  if (waitingNote !== null) show(waitingNote, r.waiting);
}

function build(r: RoundResults, flow: PlayFlow): { nodes: Node[]; parts: Parts } {
  const seats = flow.lobby?.seats;
  const { hp, gold } = r.change;
  const ring = el('span', 'hp-ring');
  ring.style.setProperty('--hp', String(hpPercent(hp.after)));
  const flash = el('span', 'hp-flash');
  const emblem = el('div', 'hp-emblem', ring, icon('hp'), flash);
  const hpNumber = el('span', 'hp-number', String(hp.after));
  const lost = hp.before - hp.after;
  const float = el('span', `hp-change${lost > 0 ? '' : ' unhurt'}`, lost > 0 ? `−${lost}` : 'No damage');
  const hero = el('div', 'result-hp', float, emblem, el('div', 'hp-text', el('span', 'label', 'Health'), hpNumber));

  let bottom: HTMLElement;
  let sources: HTMLElement[] = [];
  let bag: HTMLElement | null = null;
  let purse: HTMLElement | null = null;
  let gained: HTMLElement | null = null;
  if (gold === null) {
    const place = r.rows.find((row) => row.you)?.knockedOut ?? flow.state?.me.placement ?? null;
    bottom = el('p', 'result-out', icon('knockout'), place === null ? 'You are out of the game.' : `You are out, in ${ordinal(place)} place.`);
  } else {
    const total = gold.lines.reduce((sum, line) => sum + line.amount, 0);
    sources = gold.lines.map(sourceChip);
    bag = el('span', 'bag', icon('gold'));
    purse = el('span', 'purse-gold', String(gold.from + total));
    gained = el('span', 'purse-gained', `+${total} gold`);
    bottom = el(
      'div',
      'result-gold',
      sources.length === 0 ? el('p', 'result-none', 'No gold this round.') : el('div', 'sources', ...sources),
      el('div', 'purse', bag, purse, gained),
    );
  }

  const nodes = [
    el(
      'div',
      'result-head',
      el('span', 'outcome-icon', icon(OUTCOME_ICONS[r.outcome])),
      el('div', 'result-titles', el('p', 'eyebrow', icon(ROUND_ICONS[r.type]), `Round ${r.stage}-${r.round} · ${ROUND_NAMES[r.type]}`), el('h2', 'outcome', r.outcome)),
    ),
    hero,
    bottom,
    r.rows.length === 0
      ? el('p', 'result-empty', 'Nobody took damage this round.')
      : el(
          'table',
          'result-table',
          el('thead', '', el('tr', '', el('th', '', 'Player'), el('th', 'num', 'Damage'), el('th', '', ''))),
          el(
            'tbody',
            '',
            ...r.rows.map((row) =>
              el(
                'tr',
                `${row.you ? 'you' : ''}${row.knockedOut !== null ? ' knocked-out' : ''}`,
                el('td', 'who', el('span', '', icon(seats?.[row.seat]?.kind === 'bot' ? 'bot' : 'person'), row.name)),
                el('td', 'num damage', row.damage > 0 ? el('span', '', icon('damage'), `−${row.damage}`) : '—'),
                el('td', 'ko', row.knockedOut === null ? '' : el('span', '', icon('knockout'), `Out · ${ordinal(row.knockedOut)}`)),
              ),
            ),
          ),
        ),
    el('p', 'waiting', icon('timer'), 'Waiting for the others…'),
  ];
  return { nodes, parts: { emblem, ring, flash, hp: hpNumber, float, sources, bag, purse, gained } };
}

function sourceChip(line: IncomeLine): HTMLElement {
  const chip = el('div', `source source-${line.source}`, icon(SOURCE_ICONS[line.source]), el('span', 'name', line.label), el('span', 'amount', `+${line.amount}`));
  setTip(chip, textTip(`${line.label} · +${line.amount} gold`, line.detail));
  return chip;
}

const hpPercent = (hp: number) => Math.max(0, Math.min(100, (hp / PLAYER.startingHp) * 100));

// The animation

/** Sets the panel to how the animation starts: HP before the hit, nothing earned yet. */
function prepare(parts: Parts, { hp, gold }: RoundChange): void {
  parts.hp.textContent = String(hp.before);
  parts.ring.style.setProperty('--hp', String(hpPercent(hp.before)));
  parts.float.style.opacity = '0';
  for (const source of parts.sources) source.style.opacity = '0';
  if (parts.purse !== null) parts.purse.textContent = String(gold?.from ?? 0);
  if (parts.gained !== null) parts.gained.textContent = '+0 gold';
}

/**
 * Plays the results in: the HP takes its hit, shaking and shedding shards as its ring shrinks, then
 * one coin per gold flies from where it came from into the purse, which counts up as they land.
 * It stops if the panel is built again.
 */
function animate(panel: HTMLElement, key: string, parts: Parts, change: RoundChange): void {
  const alive = () => panel.isConnected && panel.dataset.key === key;
  const at = (ms: number, fn: () => void) => setTimeout(() => alive() && fn(), ms);
  const { hp, gold } = change;
  const lost = hp.before - hp.after;
  let held = gold?.from ?? 0;

  at(HIT_AT, () => {
    if (lost > 0) {
      parts.flash.animate([{ opacity: 0.95 }, { opacity: 0 }], { duration: 380, easing: 'ease-out' });
      parts.emblem.animate(
        [
          { transform: 'none' },
          { transform: 'translate(-6px, 2px) rotate(-6deg)' },
          { transform: 'translate(5px, -2px) rotate(5deg)' },
          { transform: 'translate(-2px, 0)' },
          { transform: 'none' },
        ],
        { duration: 360 },
      );
      shards(parts.emblem);
      parts.float.animate(
        [
          { opacity: 0, transform: 'translate(-50%, 18px) scale(0.7)' },
          { opacity: 1, transform: 'translate(-50%, -6px) scale(1.15)', offset: 0.4 },
          { opacity: 1, transform: 'translate(-50%, -14px) scale(1)' },
        ],
        { duration: 800, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' },
      );
      tween(650, alive, (t) => {
        const now = hp.before - lost * t;
        parts.hp.textContent = String(Math.round(now));
        parts.ring.style.setProperty('--hp', String(hpPercent(now)));
      });
    } else {
      parts.emblem.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.1)' }, { transform: 'scale(1)' }], { duration: 500 });
      parts.float.animate(
        [
          { opacity: 0, transform: 'translate(-50%, 10px)' },
          { opacity: 1, transform: 'translate(-50%, -14px)' },
        ],
        { duration: 500, easing: 'ease-out', fill: 'forwards' },
      );
    }
  });

  if (gold === null || parts.bag === null) return;
  const coins = coinValues(gold.lines.map((l) => l.amount));
  const every = Math.max(45, Math.min(110, COIN_STREAM_MS / Math.max(1, coins.flat().length)));
  let launched = 0;
  const start = lost > 0 ? COINS_AT.hurt : COINS_AT.unhurt;
  coins.forEach((values, i) => {
    const source = parts.sources[i]!;
    values.forEach((value, k) => {
      const last = k === values.length - 1;
      at(start + launched++ * every, () => {
        if (k === 0) {
          source.animate([{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1.12)', offset: 0.6 }, { opacity: 1, transform: 'scale(1)' }], {
            duration: 260,
            easing: 'cubic-bezier(.2,.8,.2,1)',
            fill: 'forwards',
          });
          source.classList.add('giving');
        }
        fly(panel, source, parts.bag!, k, () => {
          if (!alive()) return;
          held += value;
          parts.purse!.textContent = String(held);
          parts.gained!.textContent = `+${held - gold.from} gold`;
          parts.bag!.animate([{ transform: 'scale(1.14)' }, { transform: 'scale(1)' }], { duration: 160 });
          if (last) source.classList.remove('giving');
        });
      });
    });
  });
}

/** A coin from a source to the purse, on an arc; `k` varies the arc's height. */
function fly(panel: HTMLElement, from: HTMLElement, to: HTMLElement, k: number, landed: () => void): void {
  const box = panel.getBoundingClientRect();
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  const x0 = a.left + a.width / 2 - box.left + panel.scrollLeft - 9;
  const y0 = a.top + 6 - box.top + panel.scrollTop;
  const x1 = b.left + b.width / 2 - box.left + panel.scrollLeft - 9;
  const y1 = b.top + b.height / 2 - box.top + panel.scrollTop - 9;
  const lift = 50 + (k % 3) * 14;
  const coin = el('span', 'flying-coin', icon('coin'));
  panel.append(coin);
  coin
    .animate(
      [
        { transform: `translate(${x0}px, ${y0}px) scale(.6)`, opacity: 0 },
        { transform: `translate(${(x0 + x1) / 2}px, ${Math.min(y0, y1) - lift}px) scale(1.1)`, opacity: 1, offset: 0.5 },
        { transform: `translate(${x1}px, ${y1}px) scale(.8)`, opacity: 1 },
      ],
      { duration: COIN_FLIGHT_MS, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' },
    )
    .finished.then(
      () => {
        coin.remove();
        landed();
      },
      () => coin.remove(),
    );
}

/** Shards that burst from the HP's emblem as it takes the hit. */
function shards(emblem: HTMLElement): void {
  const count = 10;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + 0.3;
    const reach = 60 + (i % 3) * 18;
    const shard = el('span', 'hp-shard');
    emblem.append(shard);
    shard
      .animate(
        [
          { transform: 'translate(0, 0) rotate(0)', opacity: 1 },
          { transform: `translate(${Math.cos(angle) * reach}px, ${Math.sin(angle) * reach + 20}px) rotate(${200 + i * 40}deg)`, opacity: 0 },
        ],
        { duration: 650, easing: 'cubic-bezier(.15,.7,.3,1)' },
      )
      .finished.then(
        () => shard.remove(),
        () => shard.remove(),
      );
  }
}

/** Calls `step` each frame for `ms` milliseconds with eased progress from 0 to 1, while `alive`. */
function tween(ms: number, alive: () => boolean, step: (t: number) => void): void {
  const start = performance.now();
  const frame = (now: number) => {
    if (!alive()) return;
    const t = Math.min(1, (now - start) / ms);
    step(1 - (1 - t) ** 3);
    if (t < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
