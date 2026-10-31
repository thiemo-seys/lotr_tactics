// The play page's menu and lobby screen (docs/server-spec.md section 10): the lobby code with a
// button to copy the join link, and the 8 seats as cards with who sits there.

import type { PlayFlow } from '../flow.js';
import { textTip } from '../tips.js';
import { el, icon, rebuild, setText, show } from '../ui/dom.js';
import { setTip } from '../ui/tooltip.js';

const element = (id: string) => document.getElementById(id) as HTMLElement;

export function renderMenu(flow: PlayFlow): void {
  const message = element('menu-message');
  setText(message, flow.menuMessage);
  show(message, flow.menuMessage !== '');
}

export function renderLobby(flow: PlayFlow): void {
  if (flow.lobby === null) return;
  const l = flow.lobby;
  setText(element('lobby-code'), l.code);
  rebuild(element('seats'), JSON.stringify([l, flow.you]), () =>
    l.seats.map((seat, i) => {
      const you = i === flow.you;
      const away = seat.kind === 'person' && !seat.connected;
      const kindIcon = seat.kind === 'empty' ? 'empty' : seat.kind === 'bot' ? 'bot' : 'person';
      const status =
        seat.kind === 'empty' ? 'Open seat' : seat.kind === 'bot' ? 'Bot' : away ? 'Away' : you ? 'You' : 'Connected';
      const card = el(
        'li',
        `seat ${seat.kind}${you ? ' you' : ''}${away ? ' away' : ''}`,
        el('span', 'seat-icon', icon(kindIcon)),
        el('span', 'seat-text', el('span', 'seat-name', seat.kind === 'empty' ? 'Empty' : seat.name), el('span', 'seat-status', status)),
        el(
          'span',
          'seat-badges',
          i === l.host ? el('span', 'badge host', icon('host')) : null,
          seat.kind === 'person' ? el('span', `badge ${away ? 'away' : 'online'}`, icon(away ? 'away' : 'connected')) : null,
        ),
      );
      setTip(
        card,
        textTip(
          seat.kind === 'empty' ? `Seat ${i + 1}` : seat.name,
          ...(i === l.host ? ['The host, who starts the game.'] : []),
          seat.kind === 'empty' ? 'A bot takes this seat when the game starts.' : seat.kind === 'bot' ? 'A bot.' : away ? 'Disconnected.' : 'Connected.',
        ),
      );
      return card;
    }),
  );
  show(element('start'), l.host === flow.you);
  const people = l.seats.filter((s) => s.kind === 'person').length;
  const status =
    l.host === flow.you ? (people < l.seats.length ? 'Bots will take the empty seats.' : 'The lobby is full.') : 'Waiting for the host to start.';
  setText(element('lobby-message'), flow.lobbyMessage === '' ? status : flow.lobbyMessage);
}
