// The play page's HUD (docs/game-spec.md section 12): the round with its type, a timer that drains
// and turns urgent, the person's stats as pills, the streak and the One Ring's status.

import { RING, XP, roundType } from '@lotr-tactics/sim';
import type { PlayFlow } from '../flow.js';
import { hudStats, plural, ringStatus, timerView } from '../hud.js';
import { ROUND_ICONS } from '../icons.js';
import { actionTip, ringTip, textTip } from '../tips.js';
import { el, icon, rebuild, setText, show, toggle } from '../ui/dom.js';
import { setTip } from '../ui/tooltip.js';

const ROUND_NAMES = { council: 'Council of Elrond', pvp: 'PvP', pve: 'PvE' } as const;
const ROUND_HINTS = {
  council: 'Pick a unit and the item it brings, the lowest HP first.',
  pvp: 'Fight another player. The loser takes damage.',
  pve: 'Fight monsters for loot.',
} as const;

const element = (id: string) => document.getElementById(id) as HTMLElement;

export class HudBar {
  private readonly round = element('round');
  private readonly timer = element('timer');
  private readonly seconds = this.timer.querySelector('.seconds') as HTMLElement;
  private readonly drain = this.timer.querySelector('.drain i') as HTMLElement;
  private readonly stats = element('stats');
  private readonly pill = (name: string) => this.stats.querySelector(`.${name}`) as HTMLElement;
  private readonly value = (name: string) => this.pill(name).querySelector('.value') as HTMLElement;
  private readonly xpText = this.pill('level').querySelector('.xp-text') as HTMLElement;
  private readonly xpBar = this.pill('level').querySelector('.xp-bar i') as HTMLElement;
  private readonly ring = element('ring-status');
  private readonly mountDoom = element('mount-doom');
  /** The drain bar's width in steps of half a percent, to write it only when it moves. */
  private drained = -1;
  /** The state the stats were last drawn from: they change only with a new state or step. */
  private drawn: { state: unknown; step: string } = { state: null, step: '' };

  constructor(private readonly flow: PlayFlow) {
    const me = () => flow.me();
    setTip(this.pill('hp'), () => textTip('Health', `${plural(me().hp, 'HP', 'HP')} left. Lost fights cost HP, and at 0 you are out.`));
    setTip(this.pill('gold'), () => textTip('Gold', `${plural(me().gold, 'gold', 'gold')}. Spend it on units, rerolls and XP; saving earns interest.`));
    setTip(this.pill('level'), () => {
      const s = hudStats(me());
      const xp = s.xp === null ? (s.topLevel ? 'The top level.' : `XP can be bought from level ${XP.buyFromLevel}.`) : `XP ${s.xp.have} of ${s.xp.need} to the next level.`;
      return textTip(`Level ${s.level}`, `Up to ${plural(s.level, 'unit')} on the board.`, xp);
    });
    setTip(this.pill('board'), () => {
      const { board } = hudStats(me());
      return textTip('Board', `${board.fielded} of ${board.max} units fielded.`, ...(board.room ? ['There is room for a unit from your bench.'] : []));
    });
    setTip(this.pill('streak'), () => {
      const streak = hudStats(me()).streak;
      return streak === null ? null : textTip(streak.kind === 'win' ? 'Win streak' : 'Loss streak', `${plural(streak.length, streak.kind === 'win' ? 'win' : 'loss', streak.kind === 'win' ? 'wins' : 'losses')} in a row against players.`);
    });
    setTip(this.ring, () => {
      const ring = flow.planningRing();
      return ring === null ? null : ringTip(ring.corruption, ring.bearer === null ? 'Unworn: drag it onto a unit.' : undefined);
    });
    setTip(
      this.mountDoom,
      actionTip(
        'Mount Doom',
        `Throw the One Ring into Mount Doom, borne by a Hobbit who has carried it through ${RING.destroy.hobbitFights} fights. Every ring of the Three and the Nine goes with it, yours included.`,
        null,
      ),
    );
    setTip(this.round, () => {
      if (!flow.inGame) return null;
      const { stage, round } = flow.shownRound();
      const type = roundType(stage, round);
      return textTip(`Stage ${stage}, round ${round}`, `${ROUND_NAMES[type]}. ${ROUND_HINTS[type]}`);
    });
  }

  render(now: number): void {
    const { flow } = this;
    show(this.stats, flow.inGame);
    if (!flow.inGame) {
      rebuild(this.round, 'title', () => [el('span', 'brand', icon('one-ring'), 'LOTR Tactics')]);
      show(this.timer, false);
      return;
    }
    const { stage, round } = flow.shownRound();
    const type = roundType(stage, round);
    rebuild(this.round, `${stage}-${round}`, () => [
      el('span', `round-icon ${type}`, icon(ROUND_ICONS[type])),
      el('span', 'round-text', el('span', 'round-number', `${stage}-${round}`), el('span', 'round-name', ROUND_NAMES[type])),
    ]);

    const timer = timerView(flow.secondsLeft(now), flow.timerShare(now));
    show(this.timer, timer !== null);
    if (timer !== null) {
      setText(this.seconds, `${timer.seconds}`);
      toggle(this.timer, 'urgent', timer.urgent);
      const drained = Math.round(timer.fraction * 200);
      if (drained !== this.drained) {
        this.drained = drained;
        this.drain.style.width = `${drained / 2}%`;
      }
    }

    if (this.drawn.state === flow.state && this.drawn.step === flow.show.kind) return;
    this.drawn = { state: flow.state, step: flow.show.kind };
    const s = hudStats(flow.me());
    setText(this.value('hp'), `${s.hp}`);
    toggle(this.pill('hp'), 'low', s.hp <= 30);
    setText(this.value('gold'), `${s.gold}`);
    setText(this.value('level'), `${s.level}`);
    setText(this.xpText, s.xp !== null ? `${s.xp.have}/${s.xp.need} XP` : s.topLevel ? 'Top level' : 'Level');
    show(this.xpBar.parentElement!, s.xp !== null);
    if (s.xp !== null) {
      const width = `${Math.min(100, (100 * s.xp.have) / s.xp.need)}%`;
      if (this.xpBar.style.width !== width) this.xpBar.style.width = width;
    }
    setText(this.value('board'), `${s.board.fielded}/${s.board.max}`);
    toggle(this.pill('board'), 'attention', s.board.room && flow.show.kind === 'planning');
    const streak = this.pill('streak');
    show(streak, s.streak !== null);
    if (s.streak !== null) {
      toggle(streak, 'win', s.streak.kind === 'win');
      toggle(streak, 'loss', s.streak.kind === 'loss');
      setText(this.value('streak'), `${s.streak.length}`);
    }

    const ring = ringStatus(flow.planningRing());
    show(this.ring, ring !== null);
    if (ring !== null) {
      setText(this.value('ring-status'), `${ring.corruption} · ${ring.tier}${ring.unworn ? ' · unworn' : ''}`);
      this.ring.dataset.tier = ring.tier.toLowerCase();
    }
    show(this.mountDoom, flow.show.kind === 'planning' && flow.check({ type: 'destroyRing' }).ok);
  }
}
