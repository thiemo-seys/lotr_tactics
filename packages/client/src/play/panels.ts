// The play page's centre panels (docs/game-spec.md section 12): the Council's options, the Gift
// offer, a round's results, the end of the game, and the banner with a fight's outcome.

import { GIFTS, ITEMS, UNITS, type Outcome, type Team, type CouncilOptionView } from '@lotr-tactics/sim';
import type { RoundRecord } from '@lotr-tactics/server';
import { ordinal, outcomeText, standings, type PlayFlow, type RoundResults } from '../flow.js';
import { plural } from '../hud.js';
import { GIFT_TIER_ICONS, ROUND_ICONS, TRAIT_ICONS, type IconName } from '../icons.js';
import { TIER_NAMES, giftEffects } from '../gifts.js';
import { medal } from '../players.js';
import { actionTip, unitTip } from '../tips.js';
import { itemChip, ringChip, traitTag } from '../ui/chips.js';
import { el, icon, rebuild, setEnabled, setText, show } from '../ui/dom.js';
import { setTip } from '../ui/tooltip.js';

const element = (id: string) => document.getElementById(id) as HTMLElement;

const ROUND_NAMES = { council: 'Council of Elrond', pvp: 'PvP', pve: 'PvE' } as const;
const OUTCOME_ICONS: Readonly<Record<RoundResults['outcome'], IconName>> = { Victory: 'trophy', Defeat: 'knockout', Draw: 'pvp', 'No fight': 'council' };

// The Council of Elrond

export function renderCouncil(flow: PlayFlow, now: number): void {
  const c = flow.state!.council;
  if (c === null) return;
  const picks = c.options.map((_, option) => flow.check({ type: 'pick', option }).ok);
  const picking = picks.includes(true);
  const status = element('council-status');
  const waitingFor = (c.groups[c.group] ?? []).filter((seat) => seat !== flow.you).map((seat) => flow.seatName(seat));
  rebuild(status, JSON.stringify([picking, waitingFor]), () =>
    picking
      ? [icon('council'), el('strong', '', 'Your turn'), el('span', '', 'Pick a unit and what it brings.')]
      : [icon('timer'), el('span', '', `Waiting for ${waitingFor.length > 0 ? waitingFor.join(', ') : 'the others'} to pick…`)],
  );
  status.classList.toggle('your-turn', picking);
  const seconds = flow.secondsLeft(now);
  const timer = element('council-timer');
  show(timer, seconds !== null);
  if (seconds !== null) setText(timer.querySelector('.seconds')!, `${seconds}`);
  timer.classList.toggle('urgent', seconds !== null && seconds <= 5);
  const corruption = flow.state!.ring.corruption;
  rebuild(element('options'), JSON.stringify([c.options, picks, corruption, flow.lobby?.seats]), () =>
    c.options.map((option, i) => councilCard(flow, option, corruption, picks[i]! ? () => flow.act({ type: 'pick', option: i }) : null)),
  );
}

function councilCard(flow: PlayFlow, option: CouncilOptionView, corruption: number, pick: (() => void) | null): HTMLElement {
  const def = UNITS[option.unitId];
  const taken = option.pickedBy !== null;
  const ringOfPower = option.item !== null && ITEMS[option.item].ringOfPower !== undefined;
  const brings = option.item === null ? ringChip(corruption, 'md', 'Nobody is made to take it.') : itemChip(option.item, 'md');
  const card = el(
    'button',
    `council-card cost-${def.cost}${option.ring ? ' one-ring' : ''}${ringOfPower ? ' ring-of-power' : ''}${taken ? ' taken' : ''}`,
    el(
      'span',
      'portrait',
      icon(TRAIT_ICONS[def.origin], 'emblem'),
      el('span', 'name', def.name),
      el('span', 'cost-gem', String(def.cost)),
      taken ? el('span', 'taken-by', icon(flow.lobby?.seats[option.pickedBy!]?.kind === 'bot' ? 'bot' : 'person'), flow.seatName(option.pickedBy!)) : null,
    ),
    el('span', 'traits', ...[def.origin, ...def.classes].map(traitTag)),
    el('span', 'brings', brings, el('span', 'brings-name', option.item === null ? 'The One Ring' : ITEMS[option.item].name)),
  );
  card.setAttribute('aria-label', `${def.name} with ${option.item === null ? 'the One Ring' : ITEMS[option.item].name}${taken ? `, taken by ${flow.seatName(option.pickedBy!)}` : ''}`);
  setEnabled(card, pick !== null);
  setTip(card, unitTip(option.unitId, taken ? { text: `Taken by ${flow.seatName(option.pickedBy!)}.`, reason: true } : pick === null ? undefined : { text: 'Click to take this unit and what it brings.', reason: false }));
  if (pick !== null) card.addEventListener('click', pick);
  return card;
}

// Gifts of Lothlórien

export function renderGiftOffer(flow: PlayFlow): void {
  const p = flow.me();
  const offer = p.giftOffer;
  if (offer === null) return;
  const tier = offer.length > 0 ? GIFTS[offer[0]!].tier : null;
  rebuild(element('gift-tier'), `${tier}`, () => (tier === null ? [] : [el('span', `tier-label tier-${tier}`, icon(GIFT_TIER_ICONS[tier]), TIER_NAMES[tier])]));
  rebuild(element('gift-options'), JSON.stringify(offer), () =>
    offer.map((id, option) => {
      const { name, tier: giftTier } = GIFTS[id];
      const card = el(
        'button',
        `gift-card tier-${giftTier}`,
        el('span', 'gift-icon', icon(GIFT_TIER_ICONS[giftTier])),
        el('span', 'gift-name', name),
        el('span', 'gift-effects', ...giftEffects(id).map((line) => el('span', '', line))),
      );
      card.addEventListener('click', () => flow.act({ type: 'gift', option }));
      return card;
    }),
  );
  const reroll = element('reroll-gifts');
  setEnabled(reroll, !p.giftRerolled);
  if (reroll.dataset.tipped === undefined) {
    reroll.dataset.tipped = '';
    setTip(reroll, () => {
      const check = flow.check({ type: 'rerollGifts' });
      return actionTip('Reroll the Gifts', 'Three new Gifts of the same tier, once per offer.', check.ok ? null : check.reason);
    });
  }
}

// Results and the end of the game

export function renderResults(panel: HTMLElement, flow: PlayFlow, round: RoundRecord, waiting: boolean): void {
  const r = flow.results(round, waiting);
  const seats = flow.lobby?.seats;
  rebuild(panel, JSON.stringify(['results', r, seats?.map((s) => s.kind)]), () => {
    panel.className = `panel results outcome-${r.outcome.toLowerCase().replace(' ', '-')}`;
    return [
      el(
        'div',
        'result-head',
        el('span', 'outcome-icon', icon(OUTCOME_ICONS[r.outcome])),
        el(
          'div',
          'result-titles',
          el('p', 'eyebrow', icon(ROUND_ICONS[r.type]), `Round ${r.stage}-${r.round} · ${ROUND_NAMES[r.type]}`),
          el('h2', 'outcome', r.outcome),
        ),
        el('div', `damage-taken${r.taken > 0 ? ' hurt' : ''}`, icon(r.taken > 0 ? 'damage' : 'hp'), r.taken > 0 ? `−${r.taken} HP` : 'No damage'),
      ),
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
      r.waiting ? el('p', 'waiting', icon('timer'), 'Waiting for the others…') : null,
    ].filter((n) => n !== null);
  });
}

export function renderOver(panel: HTMLElement, flow: PlayFlow, offline: boolean, actions: { newGame: () => void; menu: () => void }): void {
  const s = flow.state!;
  const placement = s.me.placement!;
  const finished = s.step.kind === 'over';
  const order = standings(s.players);
  const seats = flow.lobby?.seats;
  rebuild(panel, JSON.stringify(['over', placement, finished, offline, order.map((p) => [p.seat, p.placement, p.hp]), seats]), () => {
    panel.className = `panel over${placement === 1 ? ' won' : ''}`;
    const prize = medal(placement);
    const buttons = el(
      'div',
      'actions',
      offline ? el('button', 'btn btn-primary', icon('pvp'), 'New game') : null,
      el('button', offline ? 'btn btn-secondary' : 'btn btn-primary', icon('leave'), 'Back to menu'),
    );
    const [again, back] = offline ? [buttons.children[0]!, buttons.children[1]!] : [null, buttons.children[0]!];
    again?.addEventListener('click', actions.newGame);
    back.addEventListener('click', actions.menu);
    return [
      el('p', 'eyebrow', finished ? 'The game is over' : 'The game goes on without you'),
      el('div', `place-big${prize === null ? '' : ` medal-${prize}`}`, prize === null ? null : icon(placement === 1 ? 'trophy' : 'medal'), el('span', '', ordinal(placement))),
      // The big place says it all, apart from a win.
      ...(placement === 1 ? [el('h2', 'over-title', 'You win!')] : []),
      el(
        'ol',
        'standings',
        ...order.map((p) => {
          const m = medal(p.placement);
          const rank = el('span', `rank${m === null ? '' : ` medal-${m}`}`, m === null ? (p.placement === null ? '–' : String(p.placement)) : icon('medal'));
          if (m !== null) {
            rank.setAttribute('role', 'img');
            rank.setAttribute('aria-label', ordinal(p.placement!));
          }
          return el(
            'li',
            `${p.seat === flow.you ? 'you' : ''}${p.placement === null ? ' alive' : ''}`,
            rank,
            el('span', 'who', icon(seats?.[p.seat]?.kind === 'bot' ? 'bot' : 'person'), flow.seatName(p.seat)),
            // Only players still in have something to add: their HP.
            el('span', 'state', p.placement === null ? el('span', '', icon('hp'), plural(p.hp, 'HP', 'HP')) : null),
          );
        }),
      ),
      buttons,
    ];
  });
}

/** The banner over a finished fight: Victory, Defeat or Draw for the person's team. */
export function renderBanner(banner: HTMLElement, outcome: Outcome, team: Team): void {
  const text = outcomeText(outcome, team);
  rebuild(banner, text, () => {
    banner.className = `outcome-banner ${text.toLowerCase()}`;
    return [el('span', 'banner-line'), icon(text === 'Victory' ? 'trophy' : text === 'Defeat' ? 'knockout' : 'pvp'), el('span', 'banner-text', text), el('span', 'banner-line')];
  });
}
