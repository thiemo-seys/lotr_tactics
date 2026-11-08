// The account on the play page's menu and the account panel (docs/accounts-spec.md section 14):
// the name with its guest mark and a pencil to rename, whether online play is available, the
// links to the profile and the account panel, and the panel's rename and signing out. What the
// account is and what online play can do comes from AccountState; play.ts makes the requests.

import { NAMES } from '@lotr-tactics/server';
import { nameToSend, type AccountState } from '../account.js';
import { actionTip } from '../tips.js';
import { setEnabled, setText, show, toggle } from '../ui/dom.js';
import { setTip } from '../ui/tooltip.js';

const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export interface AccountActions {
  /** Renames the account. Resolves to the server's reason if it refuses, or null. */
  rename(name: string): Promise<string | null>;
  signOut(everywhere: boolean): Promise<void>;
  /** Tries online play again after it was unavailable. */
  retry(): void;
  openProfile(): void;
  openAccount(): void;
  closeAccount(): void;
}

/** The account's name, guest mark and rename on the menu, and the account panel. */
export class AccountUi {
  private readonly strip = element('account-strip');
  private readonly who = element('account-who');
  private readonly name = element('account-name');
  private readonly guest = element('account-guest');
  private readonly renameOpen = element('rename-open');
  private readonly renameForm = element<HTMLFormElement>('rename-form');
  private readonly renameInput = element<HTMLInputElement>('rename-input');
  private readonly renameMessage = element('rename-message');
  private readonly onlineNote = element('online-note');
  private readonly retry = element('online-retry');
  private readonly links = element('menu-links');
  private readonly create = element('create');
  private readonly join = element('join');
  private readonly panelInput = element<HTMLInputElement>('account-name-input');
  private readonly panelSave = element('account-save');
  private readonly panelMessage = element('account-rename-message');
  private readonly signOutButtons = [element('sign-out'), element('sign-out-everywhere')];
  /** A request is on its way: the forms wait for it. */
  private busy = false;
  /** The name the panel's field was last filled with, so typing isn't overwritten. */
  private filled: string | null = null;
  /** Shown under the panel's buttons, such as the result of signing out. */
  message = '';

  constructor(
    private readonly account: AccountState,
    private readonly actions: AccountActions,
  ) {
    this.renameOpen.addEventListener('click', () => this.openRename());
    element('rename-cancel').addEventListener('click', () => this.closeRename());
    this.renameInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      this.closeRename();
    });
    this.renameForm.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.submit(this.renameInput.value, this.renameMessage, () => this.closeRename());
    });
    element('account-rename').addEventListener('submit', (event) => {
      event.preventDefault();
      void this.submit(this.panelInput.value, this.panelMessage, () => this.say(this.panelMessage, 'Saved.', false));
    });
    this.retry.addEventListener('click', () => actions.retry());
    element('open-profile').addEventListener('click', () => actions.openProfile());
    element('open-account').addEventListener('click', () => actions.openAccount());
    element('account-close').addEventListener('click', () => actions.closeAccount());
    element('sign-out').addEventListener('click', () => void this.signOut(false));
    element('sign-out-everywhere').addEventListener('click', () => void this.signOut(true));
    setTip(this.renameOpen, () => actionTip('Change your name', `${NAMES.minLength} to ${NAMES.maxLength} letters, digits and spaces.`, account.renameReason));
    setTip(this.create, () =>
      actionTip('Create lobby', account.game === null ? 'Make a private lobby and invite friends with its code.' : `Back to your seat in lobby ${account.game}.`, account.onlineReason),
    );
    setTip(this.join, () => actionTip('Join', account.game === null ? "Join a friend's lobby with its code." : `Back to your seat in lobby ${account.game}.`, account.onlineReason));
  }

  /** The menu's account strip, whether online play is available, and the links. */
  renderMenu(): void {
    const { me, online } = this.account;
    show(this.strip, me !== null);
    show(this.links, me !== null);
    if (me === null) {
      this.closeRename();
    } else {
      setText(this.name, me.name);
      show(this.guest, !me.claimed);
      this.who.setAttribute('aria-label', `Playing as ${me.name}${me.claimed ? '' : ', a guest'}`);
      setEnabled(this.renameOpen, this.account.renameReason === null && !this.busy);
    }
    const reason = this.account.onlineReason;
    setEnabled(this.create, reason === null);
    setEnabled(this.join, reason === null);
    // The banner speaks for a replaced connection.
    const note = online.kind === 'unavailable' || online.kind === 'connecting' ? reason : null;
    show(this.onlineNote, note !== null);
    if (note !== null) setText(this.onlineNote.querySelector('.online-note-text')!, note);
    toggle(this.onlineNote, 'pending', online.kind === 'connecting');
    show(this.retry, online.kind === 'unavailable');
  }

  /** The account panel: the name to change, what kind of account it is, and signing out. */
  renderPanel(): void {
    const { me } = this.account;
    if (me !== null && this.filled !== me.name) {
      this.filled = me.name;
      this.panelInput.value = me.name;
    }
    setEnabled(this.panelSave, me !== null && this.account.renameReason === null && !this.busy);
    for (const button of this.signOutButtons) setEnabled(button, me !== null && !this.busy);
    setText(
      element('account-kind'),
      me === null
        ? ''
        : me.claimed
          ? 'Signed in with Google.'
          : "A guest account, kept in this browser's cookies. Clearing them, or signing out, loses it and its match history.",
    );
    setText(
      element('sign-out-text'),
      me?.claimed === false ? "Signs this browser out and gives it a new guest. A guest can't sign back in." : 'Signs this browser out.',
    );
    setText(element('account-message'), this.message);
  }

  /** The panel opens with the account's name in its field. */
  opened(): void {
    this.filled = null;
    this.message = '';
    this.say(this.panelMessage, '', false);
  }

  private openRename(): void {
    const { me } = this.account;
    if (me === null || this.account.renameReason !== null) return;
    this.renameInput.value = me.name;
    show(this.renameForm, true);
    show(this.who, false);
    show(this.renameOpen, false);
    this.renameInput.focus();
    this.renameInput.select();
  }

  private closeRename(): void {
    const focused = this.renameForm.contains(document.activeElement);
    show(this.renameForm, false);
    show(this.who, true);
    show(this.renameOpen, true);
    this.say(this.renameMessage, '', true);
    if (focused) this.renameOpen.focus();
  }

  /** Checks a name as the server would, sends it, and says why if it is refused. */
  private async submit(raw: string, message: HTMLElement, done: () => void): Promise<void> {
    if (this.busy) return;
    const reason = this.account.renameReason;
    if (reason !== null) {
      this.say(message, reason, true);
      return;
    }
    const checked = nameToSend(raw, this.account.me?.name ?? null);
    if (checked === null) {
      done();
      return;
    }
    if ('error' in checked) {
      this.say(message, checked.error, true);
      return;
    }
    this.busy = true;
    this.say(message, 'Saving…', false);
    const error = await this.actions.rename(checked.name);
    this.busy = false;
    if (error === null) {
      this.say(message, '', false);
      done();
    } else {
      this.say(message, error, true);
    }
  }

  private async signOut(everywhere: boolean): Promise<void> {
    const { me } = this.account;
    if (me === null || this.busy) return;
    const lost = me.claimed ? '' : ` As a guest, you can't sign back in to ${me.name}, and its match history goes with it.`;
    const question = everywhere ? `Sign ${me.name} out of every browser and device?${lost}` : `Sign out?${lost}`;
    if (!confirm(question)) return;
    this.busy = true;
    this.message = 'Signing out…';
    this.say(this.panelMessage, '', false);
    await this.actions.signOut(everywhere);
    this.busy = false;
  }

  private say(target: HTMLElement, text: string, bad: boolean): void {
    setText(target, text);
    show(target, text !== '');
    toggle(target, 'bad', bad);
  }
}
