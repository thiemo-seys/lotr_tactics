// The account on the play page's menu and the account panel (docs/accounts-spec.md section 14):
// the name with its guest mark and a pencil to rename, Sign in with Google for guests, the prompt
// for a new name when the account needs one, whether online play is available, the links to the
// profile and the account panel, the panel's rename, signing out and deleting, and the toast that
// says how signing in went. What the account is and what online play can do comes from
// AccountState; play.ts makes the requests.

import { NAMES } from '@lotr-tactics/server';
import { SIGN_IN_GIVES, SIGN_IN_HREF, confirmsDelete, nameToSend, type AccountState, type Toast } from '../account.js';
import { actionTip } from '../tips.js';
import { setEnabled, setText, show, toggle } from '../ui/dom.js';
import { setTip } from '../ui/tooltip.js';

const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export interface AccountActions {
  /** Renames the account. Resolves to the server's reason if it refuses, or null. */
  rename(name: string): Promise<string | null>;
  signOut(everywhere: boolean): Promise<void>;
  /** Deletes the account, once `confirm` is its name. Resolves to the server's reason if it refuses, or null. */
  deleteAccount(confirm: string): Promise<string | null>;
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
  private readonly renameCancel = element('rename-cancel');
  private readonly newName = element('new-name');
  private readonly menuSignIn = element('menu-sign-in');
  private readonly panelNewName = element('account-new-name');
  private readonly panelLimit = element('account-rename-limit');
  private readonly panelSignIn = element('account-sign-in');
  private readonly deleteInput = element<HTMLInputElement>('delete-confirm');
  private readonly deleteButton = element('delete-account');
  private readonly deleteMessage = element('delete-message');
  private readonly toastBox = element('toast');
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  /** The account the menu last opened the rename field for, because it needs a new name. */
  private prompted: string | null = null;
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
    this.renameCancel.addEventListener('click', () => this.closeRename());
    this.renameInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      // A new name is needed: the field stays open until it has one.
      if (account.me?.needsName !== true) this.closeRename();
    });
    // Signing in leaves the page for Google's, as a whole page (accounts-spec.md section 6.2).
    for (const link of document.querySelectorAll<HTMLAnchorElement>('a.btn-google')) link.href = SIGN_IN_HREF;
    for (const line of document.querySelectorAll('.sign-in-gives')) line.textContent = SIGN_IN_GIVES;
    element('delete-form').addEventListener('submit', (event) => {
      event.preventDefault();
      void this.delete();
    });
    element('toast-close').addEventListener('click', () => this.hideToast());
    this.renameForm.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.submit(this.renameInput.value, this.renameMessage, () => this.closeRename(true));
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
    setTip(this.deleteButton, () => actionTip('Delete account', 'Deletes the account and its match history for good.', this.deleteReason));
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
    show(this.menuSignIn, this.account.canSignIn);
    const newName = this.account.newNameReason;
    this.callout(this.newName, newName);
    if (me === null) {
      this.closeRename();
      this.prompted = null;
    } else {
      setText(this.name, me.name);
      show(this.guest, !me.claimed);
      this.who.setAttribute('aria-label', `Playing as ${me.name}${me.claimed ? '' : ', a guest'}`);
      setEnabled(this.renameOpen, this.account.renameReason === null && !this.busy);
      // A new name before anything else online: the field opens by itself, once for the account,
      // and can't be cancelled until the name is chosen.
      show(this.renameCancel, newName === null);
      if (newName !== null && this.prompted !== me.id) {
        this.prompted = me.id;
        this.openRename();
      } else if (newName === null && this.prompted === me.id) {
        // Chosen, perhaps in the account panel: the field the prompt opened closes.
        this.prompted = null;
        this.closeRename(true);
      }
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
    const renameReason = this.account.renameReason;
    setEnabled(this.panelSave, me !== null && renameReason === null && !this.busy);
    // Why the name can't change now, such as the 7-day limit, under the field.
    this.say(this.panelLimit, me === null ? '' : (renameReason ?? ''), false);
    this.callout(this.panelNewName, this.account.newNameReason);
    show(this.panelSignIn, this.account.canSignIn);
    for (const button of this.signOutButtons) setEnabled(button, me !== null && !this.busy);
    setText(
      element('account-kind'),
      me === null
        ? ''
        : me.claimed
          ? 'Signed in with Google. Sign in with the same Google account to use it on any device.'
          : "A guest account, kept in this browser's cookies. Clearing them, or signing out, loses it and its match history.",
    );
    setText(
      element('delete-text'),
      me === null
        ? ''
        : `Deletes ${me.name} and its match history for good. In other players' histories it shows as "Deleted player".${
            me.claimed ? ' Signing in with the same Google account afterwards makes a new account.' : ''
          } You can't delete it while you have a seat in a lobby or game.`,
    );
    setText(element('delete-label'), me === null ? '' : `Type ${me.name} to confirm`);
    setEnabled(this.deleteButton, this.deleteReason === null);
    setText(
      element('sign-out-text'),
      me?.claimed === false ? "Signs this browser out and gives it a new guest. A guest can't sign back in." : 'Signs this browser out.',
    );
    setText(element('account-message'), this.message);
  }

  /** The panel opens with the account's name in its field, and nothing typed to delete it. */
  opened(): void {
    this.filled = null;
    this.message = '';
    this.say(this.panelMessage, '', false);
    this.deleteInput.value = '';
    this.say(this.deleteMessage, '', true);
  }

  /** Shows a message at the top of the page for its time, or until dismissed. */
  toast(toast: Toast): void {
    setText(this.toastBox.querySelector('.toast-text')!, toast.text);
    for (const tone of ['good', 'info', 'warn', 'bad']) toggle(this.toastBox, tone, tone === toast.tone);
    show(this.toastBox, true);
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.hideToast(), toast.seconds * 1000);
  }

  /** Takes the toast away, as when a game starts. */
  hideToast(): void {
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    this.toastTimer = null;
    show(this.toastBox, false);
  }

  /** Why Delete account can't be pressed now, or null. */
  private get deleteReason(): string | null {
    const { me } = this.account;
    if (me === null) return 'Online play is unavailable.';
    if (this.busy) return 'Wait for the last request.';
    return confirmsDelete(this.deleteInput.value, me.name) ? null : `Type ${me.name} above to confirm.`;
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

  /** Closes the rename field; after a rename, also when the account needed a new name. */
  private closeRename(saved = false): void {
    if (!saved && this.account.me?.needsName === true) return;
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
    const checked = nameToSend(raw, this.account.me?.name ?? null, this.account.me?.needsName === true);
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

  /**
   * Deletes the account once its name is typed. The page's connection closes first, as for signing
   * out; on success the page gets a new guest, and on a refusal the server's reason shows.
   */
  private async delete(): Promise<void> {
    const { me } = this.account;
    if (me === null || this.deleteReason !== null) return;
    this.busy = true;
    this.say(this.deleteMessage, 'Deleting…', false);
    const error = await this.actions.deleteAccount(this.deleteInput.value.trim());
    this.busy = false;
    if (error === null) {
      this.deleteInput.value = '';
      this.say(this.deleteMessage, '', true);
    } else {
      this.say(this.deleteMessage, error, true);
    }
  }

  /** A callout's text, hidden without one. */
  private callout(target: HTMLElement, text: string | null): void {
    show(target, text !== null);
    if (text !== null) setText(target.querySelector('.name-callout-text')!, text);
  }

  private say(target: HTMLElement, text: string, bad: boolean): void {
    setText(target, text);
    show(target, text !== '');
    toggle(target, 'bad', bad);
  }
}
