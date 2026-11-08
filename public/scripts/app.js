/*!
 * CICADA — shared page behaviour (every page except the homepage animation, which lives in /static/home/).
 * No dependencies, no inline handlers: everything here is attached by attribute so the
 * Content-Security-Policy can forbid inline event handlers.
 *
 *   #mobile-menu-button / #mobile-menu   the header menu: a small panel under its button
 *   [data-confirm]                       confirm before submitting a form or following a button/link
 *   form[data-final-choice]              a choice that can't be undone (a participation mode, a team's problem
 *                                        statement): confirm in a themed dialog (data-final-title, -body,
 *                                        -confirm) before submitting; {choice} in them names the option chosen
 *                                        in the control that data-final-field names
 *   input[type=file][data-private-document][data-max-bytes]   size check before upload
 *   [data-autosubmit]                    submit the owning form when a control changes
 *   input[data-not-value]                refused while it holds that value (any case, spaces trimmed), with
 *                                        data-not-value-message as the browser's message (e.g. one's own
 *                                        referral code); the server refuses it too
 */
(() => {
  'use strict';
  const root = document.documentElement;
  root.classList.remove('no-js');
  root.classList.add('js');

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  ready(() => {
    /* ---------- mode choices: keep detail forms below the single-row menu ---------- */
    const modeSwitchMenu = document.querySelector('[data-mode-switch-menu]');
    if (modeSwitchMenu) {
      const triggers = Array.from(modeSwitchMenu.querySelectorAll('[data-mode-switch-show]'));
      const panels = triggers.map((trigger) => document.getElementById(trigger.getAttribute('aria-controls'))).filter(Boolean);
      triggers.forEach((trigger) => {
        trigger.addEventListener('click', () => {
          const panel = document.getElementById(trigger.getAttribute('aria-controls'));
          if (!panel) return;
          const opening = panel.hidden;
          panels.forEach((item) => { item.hidden = true; });
          triggers.forEach((item) => { item.setAttribute('aria-expanded', 'false'); });
          if (opening) {
            panel.hidden = false;
            trigger.setAttribute('aria-expanded', 'true');
          }
        });
      });
    }

    /* ---------- the menu: a small panel under its button (every page, the homepage included) ---------- */
    const btn = document.getElementById('mobile-menu-button');
    const menu = document.getElementById('mobile-menu');
    if (btn && menu) {
      const still = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
      const visible = (el) => el.getClientRects().length > 0;
      let closing = 0;
      const isOpen = () => btn.getAttribute('aria-expanded') === 'true';
      const setOpen = (open, returnFocus) => {
        window.clearTimeout(closing);
        btn.setAttribute('aria-expanded', String(open));
        if (open) {
          menu.classList.remove('hidden');
          // one frame in the closed pose, so the sheet unfolds from its button
          requestAnimationFrame(() => requestAnimationFrame(() => { if (isOpen()) menu.classList.add('is-open'); }));
          const first = Array.from(menu.querySelectorAll('a, button')).find(visible);
          if (first) first.focus({ preventScroll: true });
        } else {
          menu.classList.remove('is-open');
          const hide = () => { if (!isOpen()) menu.classList.add('hidden'); };
          if (still.matches) hide(); else closing = window.setTimeout(hide, 240);
          if (returnFocus) btn.focus({ preventScroll: true });
        }
      };
      btn.addEventListener('click', () => setOpen(!isOpen(), false));
      document.addEventListener('click', (e) => {
        if (isOpen() && !menu.contains(e.target) && !btn.contains(e.target)) setOpen(false, false);
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOpen()) setOpen(false, true);
      });
      // keyboard users who tab past the last item leave the menu closed behind them
      menu.addEventListener('focusout', (e) => {
        if (isOpen() && e.relatedTarget && !menu.contains(e.relatedTarget) && e.relatedTarget !== btn) setOpen(false, false);
      });
      window.addEventListener('resize', () => {
        if (isOpen() && !visible(btn)) setOpen(false, false);
      }, { passive: true });
    }

    /* ---------- confirmations (replaces inline onsubmit="return confirm(…)") ---------- */
    document.addEventListener('submit', (e) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement)) return;
      const submitter = e.submitter;
      const message = (submitter && submitter.dataset.confirm) || form.dataset.confirm;
      if (message && !window.confirm(message)) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
    document.addEventListener('click', (e) => {
      const el = e.target instanceof Element ? e.target.closest('a[data-confirm], button[data-confirm]') : null;
      if (!el) return;
      // submit buttons are confirmed once, in the submit listener above
      if (el.tagName === 'BUTTON' && el.form && (el.type || 'submit') === 'submit') return;
      if (!window.confirm(el.dataset.confirm)) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);

    /* ---------- a final choice: a themed dialog before a form that can't be undone ---------- */
    // Built once, from text the server rendered into data attributes (set with textContent, never as HTML).
    // Without <dialog> support the browser's own confirm() asks instead; without JavaScript the form's
    // required acknowledgement checkbox, checked again on the server, still stands.
    let finalDialog = null;
    const buildFinalDialog = () => {
      const dialog = document.createElement('dialog');
      dialog.className = 'final-dialog';
      dialog.setAttribute('aria-labelledby', 'final-dialog-title');
      dialog.setAttribute('aria-describedby', 'final-dialog-body');
      const panel = document.createElement('div');
      panel.className = 'final-dialog__panel';
      const eyebrow = document.createElement('p');
      eyebrow.className = 'final-dialog__eyebrow';
      eyebrow.textContent = 'This choice is final';
      const title = document.createElement('h2');
      title.className = 'final-dialog__title';
      title.id = 'final-dialog-title';
      const body = document.createElement('p');
      body.className = 'final-dialog__body';
      body.id = 'final-dialog-body';
      const actions = document.createElement('div');
      actions.className = 'actions final-dialog__actions';
      const confirm = document.createElement('button');
      confirm.type = 'button';
      confirm.className = 'btn btn--primary';
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'btn btn--secondary';
      cancel.textContent = 'Go back';
      actions.append(confirm, cancel);
      panel.append(eyebrow, title, body, actions);
      dialog.append(panel);
      document.body.append(dialog);
      return { dialog, title, body, confirm, cancel };
    };
    // What was chosen in the control data-final-field names (a select's option, a checked radio's label), for
    // {choice} in the dialog's text; read as text, never as HTML.
    const chosenText = (form) => {
      const name = form.dataset.finalField;
      const control = name ? form.elements.namedItem(name) : null;
      if (control instanceof HTMLSelectElement) {
        const option = control.selectedOptions[0];
        return option && option.value ? option.textContent.trim() : '';
      }
      const inputs = control instanceof RadioNodeList ? Array.from(control) : (control ? [control] : []);
      const checked = inputs.find((input) => input.checked);
      if (!checked) return '';
      const label = checked.labels && checked.labels[0];
      return (label ? label.textContent : checked.value).trim();
    };
    const withChoice = (text, choice) => (text || '').split('{choice}').join(choice || 'your choice');
    document.addEventListener('submit', (e) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement) || !form.hasAttribute('data-final-choice')) return;
      if (form.dataset.finalConfirmed === 'true') return;
      const choice = chosenText(form);
      const heading = withChoice(form.dataset.finalTitle, choice) || 'Are you sure?';
      const text = withChoice(form.dataset.finalBody, choice);
      if (typeof HTMLDialogElement !== 'function' || typeof document.createElement('dialog').showModal !== 'function') {
        if (!window.confirm(text ? `${heading}\n\n${text}` : heading)) { e.preventDefault(); e.stopImmediatePropagation(); }
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      const submitter = e.submitter && e.submitter.form === form ? e.submitter : null;
      finalDialog = finalDialog || buildFinalDialog();
      const { dialog, title, body, confirm, cancel } = finalDialog;
      title.textContent = heading;
      body.textContent = text;
      confirm.textContent = withChoice(form.dataset.finalConfirm, choice) || 'Confirm';
      const settle = (confirmed) => {
        confirm.onclick = null; cancel.onclick = null; dialog.oncancel = null; dialog.onclick = null;
        if (dialog.open) dialog.close();
        if (!confirmed) { if (submitter) submitter.focus(); return; }
        form.dataset.finalConfirmed = 'true';
        if (typeof form.requestSubmit === 'function') form.requestSubmit(submitter || undefined);
        else form.submit();
      };
      confirm.onclick = () => settle(true);
      cancel.onclick = () => settle(false);
      dialog.oncancel = (event) => { event.preventDefault(); settle(false); };        // Escape
      dialog.onclick = (event) => { if (event.target === dialog) settle(false); };  // the backdrop
      dialog.showModal();
      cancel.focus();
    }, true);

    /* ---------- links marked aria-disabled never navigate (replaces onclick="return false;") ---------- */
    document.addEventListener('click', (e) => {
      const link = e.target instanceof Element ? e.target.closest('a[aria-disabled="true"]') : null;
      if (link) e.preventDefault();
    });

    /* ---------- submit a form when a control changes ---------- */
    document.addEventListener('change', (e) => {
      const el = e.target;
      if (el instanceof Element && el.hasAttribute('data-autosubmit') && el.form) el.form.requestSubmit ? el.form.requestSubmit() : el.form.submit();
    });

    /* ---------- private documents: stop oversized uploads before they leave the browser ---------- */
    const template = document.body.dataset.oversizeMessage ||
      '{label} exceeds the {mb} MB limit. Choose a smaller file; the rest of your form has been preserved.';
    const privateDocumentInputs = Array.from(document.querySelectorAll('input[type="file"][data-private-document]'));
    const privateDocumentForms = new Set(privateDocumentInputs.map((input) => input.form).filter(Boolean));
    const errorBoxFor = (form) => {
      let box = form.querySelector('[data-private-document-error]');
      if (!box) {
        box = document.createElement('div');
        box.dataset.privateDocumentError = '';
        box.setAttribute('role', 'alert');
        box.className = 'alert alert--error hidden';
        form.prepend(box);
      }
      return box;
    };
    const oversizedMessage = (input) => {
      const file = input.files && input.files[0];
      const maximum = Number(input.dataset.maxBytes || 0);
      if (!file || !maximum || file.size <= maximum) return '';
      const labelEl = input.closest('label, .field');
      const label = (input.labels && input.labels[0] && input.labels[0].textContent.trim()) ||
        (labelEl && labelEl.querySelector('.form-label, label')?.textContent?.trim()) || 'Document';
      const maximumMb = Math.round(maximum / (1024 * 1024));
      return template.replace('{label}', label).replace('{mb}', String(maximumMb));
    };
    const validatePrivateDocuments = (form) => {
      const inputs = Array.from(form.querySelectorAll('input[type="file"][data-private-document]'));
      const invalidInput = inputs.find((input) => oversizedMessage(input));
      const box = errorBoxFor(form);
      inputs.forEach((input) => input.removeAttribute('aria-invalid'));
      if (!invalidInput) {
        box.textContent = '';
        box.classList.add('hidden');
        return true;
      }
      invalidInput.setAttribute('aria-invalid', 'true');
      box.textContent = oversizedMessage(invalidInput);
      box.classList.remove('hidden');
      invalidInput.focus();
      return false;
    };
    privateDocumentInputs.forEach((input) => input.addEventListener('change', () => validatePrivateDocuments(input.form)));
    privateDocumentForms.forEach((form) => form.addEventListener('submit', (event) => {
      if (!validatePrivateDocuments(form)) { event.preventDefault(); event.stopImmediatePropagation(); }
    }));

    /* ---------- a value a field must not hold (one's own referral code) ---------- */
    document.querySelectorAll('input[data-not-value]').forEach((input) => {
      const refused = (input.dataset.notValue || '').trim().toUpperCase();
      const check = () => {
        const same = refused && input.value.trim().toUpperCase() === refused;
        input.setCustomValidity(same ? (input.dataset.notValueMessage || 'This value cannot be used here.') : '');
      };
      input.addEventListener('input', check);
      check();
    });
  });
})();
