// The play page's HUD (docs/game-spec.md section 12): at the top, HP, the board count, the streak
// and the One Ring's status, with the stage tracker in the middle, the stage's rounds as icons by
// type; at the bottom, by the shop, the level with its XP, gold and a timer that drains and turns
// urgent. While the person's fight plays, the stats are as they were in its round's planning
// (PlayFlow.shownView), and the tracker shows its round's result only once its results do.

import { RING, XP, roundType } from '@lotr-tactics/sim';
import type { PlayFlow } from '../flow.js';
import { hudStats, plural, ringStatus, shopOddsView, stageTrack, timerView, type HudStats, type StageNode } from '../hud.js';
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
  private readonly playerBar = element('player-bar');
  private readonly pill = (name: string) => element(`stat-${name}`);
  private readonly value = (name: string) => this.pill(name).querySelector('.value') as HTMLElement;
  private readonly xpText = this.pill('level').querySelector('.xp-text') as HTMLElement;
  private readonly xpBar = this.pill('level').querySelector('.xp-bar i') as HTMLElement;
  private readonly ring = this.pill('ring-status');
  private readonly mountDoom = element('mount-doom');
  /** The drain bar's width in steps of half a percent, to write it only when it moves. */
  private drained = -1;
  /** The state the stats were last drawn from: they change only with a new state or step. */
  private drawn: { state: unknown; step: string } = { state: null, step: '' };
  /**
   * The round the stage tracker was last drawn for, and how many results had been shown then: it
   * changes only with one of them, so other frames, a fight's among them, don't work it out again.
   */
  private readonly tracked = { stage: -1, round: -1, outcomes: -1 };

  constructor(private readonly flow: PlayFlow) {
    const me = () => flow.shownView().me;
    setTip(this.pill('hp'), () => textTip('Health', `${plural(me().hp, 'HP', 'HP')} left. Lost fights cost HP, and at 0 you are out.`));
    setTip(this.pill('gold'), () => textTip('Gold', `${plural(me().gold, 'gold', 'gold')}. Spend it on units, rerolls and XP; saving earns interest.`));
    setTip(this.pill('level'), () => {
      const s = this.shownStats();
      const xp = s.xp === null ? (s.topLevel ? 'The top level.' : `XP can be bought from level ${XP.buyFromLevel}.`) : `XP ${s.xp.have} of ${s.xp.need} to the next level.`;
      const odds = shopOddsView(me());
      return { ...textTip(`Level ${s.level}`, `Up to ${plural(s.level, 'unit')} on the board.`, xp, ...(odds.note === null ? [] : [odds.note])), odds: odds.rows };
    });
    setTip(this.pill('board'), () => {
      const { board } = this.shownStats();
      return textTip('Board', `${board.fielded} of ${board.max} units fielded.`, ...(board.room ? ['There is room for a unit from your bench.'] : []));
    });
    setTip(this.pill('streak'), () => {
      const streak = this.shownStats().streak;
      return streak === null ? null : textTip(streak.kind === 'win' ? 'Win streak' : 'Loss streak', `${plural(streak.length, streak.kind === 'win' ? 'win' : 'loss', streak.kind === 'win' ? 'wins' : 'losses')} in a row against players.`);
    });
    setTip(this.ring, () => {
      const ring = flow.planningRing(flow.shownView());
      return ring === null ? null : ringTip(ring.corruption, ring.bearer === null ? 'Unworn: drag it onto a unit.' : undefined);
    });
    setTip(
      this.mountDoom,
      actionTip(
        'Mount Doom',
        `Throw the One Ring into Mount Doom: a Hobbit bearer can, once Hobbits have carried it through ${RING.destroy.hobbitFights} fights. You gain ${RING.destroy.gold} gold and ${plural(RING.destroy.combinedItems, 'random combined item')}. Every ring of the Three and the Nine goes with it, yours included.`,
        null,
      ),
    );
  }

  render(now: number): void {
    const { flow } = this;
    show(this.stats, flow.inGame);
    show(this.playerBar, flow.inGame);
    const { tracked } = this;
    if (!flow.inGame) {
      rebuild(this.round, 'title', () => [el('span', 'brand', icon('one-ring'), 'LOTR Tactics')]);
      tracked.stage = -1;
      show(this.timer, false);
      return;
    }
    const { stage, round } = flow.shownRound();
    // A round's result shows once its results have been shown (PlayFlow.outcome), as the HUD's stats
    // do (PlayFlow.shownView), so the person's fight doesn't give it away while it plays.
    if (stage !== tracked.stage || round !== tracked.round || flow.outcomesShown !== tracked.outcomes) {
      tracked.stage = stage;
      tracked.round = round;
      tracked.outcomes = flow.outcomesShown;
      const type = roundType(stage, round);
      const track = stageTrack(stage, round, (s, r) => flow.outcome(s, r));
      rebuild(this.round, JSON.stringify(track), () => [
        el('span', 'stage-label', el('span', 'stage-eyebrow', 'Stage'), el('span', 'stage-number', String(stage))),
        el('ol', 'stage-rounds', ...track.map((node) => roundNode(stage, node))),
        el('span', 'round-text', el('span', 'round-number', `${stage}-${round}`), el('span', `round-name ${type}`, ROUND_NAMES[type])),
      ]);
    }

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

    const view = flow.shownView();
    if (this.drawn.state === view && this.drawn.step === flow.show.kind) return;
    this.drawn = { state: view, step: flow.show.kind };
    const s = this.shownStats();
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

    const ring = ringStatus(flow.planningRing(view));
    show(this.ring, ring !== null);
    if (ring !== null) {
      setText(this.value('ring-status'), `${ring.corruption} · ${ring.tier}${ring.unworn ? ' · unworn' : ''}`);
      this.ring.dataset.tier = ring.tier.toLowerCase();
    }
    show(this.mountDoom, flow.show.kind === 'planning' && flow.check({ type: 'destroyRing' }).ok);
  }

  /** The person's stats as shown: during their fight, from its planning, with the units that fight on the board. */
  private shownStats(): HudStats {
    const { flow } = this;
    return hudStats(flow.shownView().me, flow.show.kind === 'fight' ? flow.trackedTeam().board : null);
  }
}

const OUTCOME_ICONS = { Victory: 'ready', Defeat: 'cross', Draw: 'level' } as const;

/** A round in the stage tracker: its type's icon in the type's colour, marked as played, on screen or to come, with the person's result. */
function roundNode(stage: number, node: StageNode): HTMLElement {
  const item = el(
    'li',
    `round-node ${node.type} ${node.state}${node.outcome === null ? '' : ` ${node.outcome.toLowerCase()}`}`,
    el('span', 'round-icon', icon(ROUND_ICONS[node.type])),
    node.outcome === null || node.state === 'current' ? null : el('span', 'round-result', icon(OUTCOME_ICONS[node.outcome])),
  );
  item.tabIndex = 0;
  const when = node.state === 'done' ? 'Played.' : node.state === 'current' ? 'This round.' : 'To come.';
  item.setAttribute('aria-label', `Round ${stage}-${node.round}: ${ROUND_NAMES[node.type]}. ${when}${node.outcome === null ? '' : ` ${node.outcome}.`}`);
  // Whether it is played, on now or to come shows in how it is drawn, so the tip leaves it out.
  setTip(item, textTip(`Round ${stage}-${node.round} · ${ROUND_NAMES[node.type]}`, ROUND_HINTS[node.type], ...(node.outcome === null ? [] : [`${node.outcome}.`])));
  return item;
}
