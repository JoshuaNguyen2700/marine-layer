/*
  Edit site page.

  The form edits a plain "form model" (Settings.toForm). Saving validates
  it (Settings.validateForm), turns it into clean settings
  (Settings.fromForm) and hands them to window.SettingsStore.
  Everything typed here is shown with textContent / value, never as HTML.
*/
(function () {
  "use strict";

  var Settings = window.Settings, store = window.SettingsStore, UI = window.SiteUI;
  var el = UI.el, clear = UI.clear;
  var DEFAULTS = window.SITE_DEFAULTS;

  var formNode = document.getElementById("edit-form");
  if (!formNode || !Settings || !store) return;

  var statusRegion = document.getElementById("edit-status");
  var alertRegion = document.getElementById("edit-alert");
  var savebar = document.getElementById("savebar");
  var savebarStatus = document.getElementById("savebar-status");
  var discardButton = savebar.querySelector('[data-action="discard"]');

  var DAY_LABEL = { sunday: "Sunday", monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday", thursday: "Thursday", friday: "Friday", saturday: "Saturday" };
  var WEEK = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

  function copy(v) { return JSON.parse(JSON.stringify(v)); }

  var state = {
    saved: Settings.toForm(window.SITE), // last saved, as a form model
    form: null,                          // what's being edited
    errors: {},
    warnings: {},
    expanded: {},                        // service id -> true
    confirm: null,                       // { kind: "service", id } or { kind: "reset" }
    justSaved: false
  };
  state.form = copy(state.saved);

  if (store.kind === "localStorage") document.getElementById("store-note").hidden = false;

  /* ---------- Paths into the form model ---------- */

  function getPath(obj, path) {
    return path.split(".").reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj);
  }
  function setPath(obj, path, value) {
    var keys = path.split("."), last = keys.pop();
    var target = keys.reduce(function (o, k) { return o[k]; }, obj);
    target[last] = value;
  }
  function idFor(path) { return "f-" + path.replace(/[^A-Za-z0-9]/g, "-"); }

  function announce(message, assertive) {
    var region = assertive ? alertRegion : statusRegion;
    region.textContent = "";
    window.setTimeout(function () { region.textContent = message; }, 60);
  }

  function isDirty() { return JSON.stringify(state.form) !== JSON.stringify(state.saved); }

  /* ---------- Field builders ---------- */

  function messageNode(path) {
    var err = state.errors[path], warn = state.warnings[path];
    var text = err || warn || "";
    return el("p", {
      class: "field-error" + (warn && !err ? " field-error--warning" : ""),
      id: idFor(path) + "-msg", hidden: !text, dataset: { msgFor: path }
    }, warn && !err ? el("span", { class: "field-error__tag", text: "Check: " }) : null, text);
  }

  function describedBy(path, hintId) {
    var ids = [];
    if (hintId) ids.push(hintId);
    if (state.errors[path] || state.warnings[path]) ids.push(idFor(path) + "-msg");
    return ids.join(" ") || null;
  }

  /*
    field("businessName", "Business name", { type, hint, multiline, optional, attrs, after })
  */
  function field(path, label, opts) {
    opts = opts || {};
    var id = idFor(path);
    var hintId = opts.hint ? id + "-hint" : null;
    var value = getPath(state.form, path);
    var attrs = Object.assign({
      id: id, name: path, class: "input" + (opts.multiline ? " input--area" : "") + (opts.inputClass ? " " + opts.inputClass : ""),
      dataset: { path: path },
      "aria-describedby": describedBy(path, hintId),
      "aria-invalid": state.errors[path] ? "true" : null
    }, opts.attrs || {});
    var control;
    if (opts.multiline) {
      attrs.rows = opts.rows || "4";
      control = el("textarea", attrs);
    } else if (opts.options) {
      control = el("select", attrs);
      opts.options.forEach(function (o) {
        control.appendChild(el("option", { value: o.value, text: o.label }));
      });
    } else {
      attrs.type = opts.type || "text";
      control = el("input", attrs);
    }
    control.value = value == null ? "" : String(value);
    return el("div", { class: "field" + (opts.wide ? " field--wide" : "") + (opts.compact ? " field--compact" : "") },
      el("label", { for: id, class: "field__label" }, label,
        opts.optional ? el("span", { class: "field__optional", text: " (optional)" }) : null),
      opts.hint ? el("p", { class: "field__hint", id: hintId, text: opts.hint }) : null,
      control,
      opts.after || null,
      messageNode(path)
    );
  }

  function checkbox(path, label, extraLabel) {
    var id = idFor(path);
    var input = el("input", { type: "checkbox", id: id, name: path, class: "check__input", dataset: { path: path } });
    input.checked = !!getPath(state.form, path);
    return el("div", { class: "check" }, input,
      el("label", { for: id, class: "check__label" }, label, extraLabel ? el("span", { class: "sr-only", text: " " + extraLabel }) : null));
  }

  function actionButton(action, text, data, opts) {
    opts = opts || {};
    return el("button", {
      type: "button", class: opts.class || "link-button", text: text,
      dataset: Object.assign({ action: action }, data || {}),
      "aria-label": opts.label || null,
      "aria-expanded": opts.expanded == null ? null : String(opts.expanded),
      "aria-controls": opts.controls || null
    });
  }

  /* ---------- Sections ---------- */

  var renderers = {
    business: function (box) {
      box.appendChild(el("div", { class: "edit-fields" },
        field("businessName", "Business name", { attrs: { autocomplete: "organization", maxlength: "80" } }),
        field("descriptor", "Descriptor line", { optional: true, hint: "Shown under the name, e.g. Hair, makeup, lashes and brows in San Francisco." }),
        field("ownerName", "Your name", { optional: true, hint: "Left blank, your name doesn't appear on the site.", attrs: { autocomplete: "name" } }),
        field("heroSentence", "Sentence at the top of the page", { optional: true, multiline: true, rows: "2", wide: true }),
        field("aboutText", "About text", { optional: true, multiline: true, rows: "8", wide: true, hint: "Leave a blank line between paragraphs." }),
        field("galleryTitle", "Heading above the photo row", { optional: true })
      ));
    },

    contact: function (box) {
      box.appendChild(el("div", { class: "edit-fields" },
        field("city", "City", { optional: true, attrs: { autocomplete: "address-level2" } }),
        field("neighborhood", "Neighborhood", { optional: true, hint: "For example Inner Sunset." }),
        field("streetAddress", "Street address", { optional: true, attrs: { autocomplete: "street-address" } }),
        field("phone", "Phone", { type: "tel", optional: true, hint: "A 10-digit US number, like (415) 555-0123.", attrs: { autocomplete: "tel", inputmode: "tel" } }),
        field("email", "Email", { type: "email", optional: true, attrs: { autocomplete: "email", inputmode: "email", spellcheck: "false", autocapitalize: "off" } }),
        field("instagram", "Instagram", { optional: true, hint: "Your name, @name, or the full instagram.com address.", attrs: { autocapitalize: "off", spellcheck: "false" } }),
        field("licenseNumber", "License number", { optional: true, hint: "From the California Board of Barbering and Cosmetology. The footer always says \u201cCalifornia cosmetology license\u201d and adds this number." })
      ));
    },

    hours: function (box) {
      var list = el("div", { class: "hours-edit", role: "list" });
      WEEK.forEach(function (day) {
        var h = state.form.hours[day];
        var row = el("div", { class: "day-row" + (h.open ? "" : " is-closed"), role: "listitem" },
          el("p", { class: "day-row__name", text: DAY_LABEL[day] }),
          checkbox("hours." + day + ".open", "Open", "on " + DAY_LABEL[day])
        );
        if (h.open) {
          row.appendChild(el("div", { class: "day-row__times" },
            field("hours." + day + ".from", "Opens", { type: "time", compact: true, attrs: { step: "300", "aria-label": "Opens on " + DAY_LABEL[day] } }),
            field("hours." + day + ".to", "Closes", { type: "time", compact: true, attrs: { step: "300", "aria-label": "Closes on " + DAY_LABEL[day] } })
          ));
        } else {
          row.appendChild(el("p", { class: "day-row__closed", text: "Closed" }));
        }
        list.appendChild(row);
      });
      box.appendChild(list);

      var dates = el("div", { class: "edit-list" });
      dates.appendChild(el("h3", { class: "edit-subtitle", text: "Days off" }));
      dates.appendChild(el("p", { class: "field__hint", text: "Single dates you're closed, such as holidays. They can't be booked." }));
      var ul = el("ul", { class: "edit-list__items", role: "list" });
      state.form.closedDates.forEach(function (d, i) {
        ul.appendChild(el("li", { class: "edit-list__item" },
          field("closedDates." + i, "Closed date " + (i + 1), { type: "date", compact: true }),
          actionButton("date-remove", "Remove", { index: String(i) }, { label: "Remove closed date " + (d || (i + 1)) })
        ));
      });
      dates.appendChild(ul);
      dates.appendChild(actionButton("date-add", "Add a closed date", null, { class: "button button--line" }));
      box.appendChild(dates);
    },

    rules: function (box) {
      box.appendChild(el("div", { class: "edit-fields" },
        field("minNoticeHours", "Minimum notice, in hours", { type: "number", hint: "How long before an appointment it must be booked.", attrs: { min: "0", max: "720", step: "1", inputmode: "numeric" } }),
        field("maxDaysAhead", "Book up to this many days ahead", { type: "number", attrs: { min: "1", max: "365", step: "1", inputmode: "numeric" } }),
        field("bufferMinutes", "Buffer after each appointment, in minutes", { type: "number", hint: "Time kept free for cleanup before the next client.", attrs: { min: "0", max: "120", step: "1", inputmode: "numeric" } }),
        field("slotMinutes", "Start times every", { options: Settings.SLOT_CHOICES.map(function (n) { return { value: String(n), label: n + " minutes" }; }) })
      ));
      box.appendChild(el("div", { class: "edit-fields" },
        field("cancellationPolicy", "Cancellation policy", { optional: true, multiline: true, rows: "2", wide: true, hint: "Shown on the review and confirmation screens." }),
        field("priceNote", "Price note", { optional: true, multiline: true, rows: "2", wide: true, hint: "Shown next to the services and prices." })
      ));

      var wrap = el("div", { class: "edit-list" });
      wrap.appendChild(el("h3", { class: "edit-subtitle", text: "Policies" }));
      wrap.appendChild(el("p", { class: "field__hint", text: "Each line is shown in the Visit section. Empty lines are left out." }));
      var ul = el("ul", { class: "edit-list__items", role: "list" });
      state.form.policies.forEach(function (p, i) {
        ul.appendChild(el("li", { class: "edit-list__item edit-list__item--wide" },
          field("policies." + i, "Policy " + (i + 1), { multiline: true, rows: "2" }),
          actionButton("policy-remove", "Remove", { index: String(i) }, { label: "Remove policy " + (i + 1) })
        ));
      });
      wrap.appendChild(ul);
      wrap.appendChild(actionButton("policy-add", "Add a policy", null, { class: "button button--line" }));
      box.appendChild(wrap);
    },

    services: function (box) {
      if (state.warnings.services) {
        box.appendChild(el("p", { class: "field-error field-error--warning", id: idFor("services") + "-msg", dataset: { msgFor: "services" } },
          el("span", { class: "field-error__tag", text: "Check: " }), state.warnings.services));
      }
      box.appendChild(field("heroServiceId", "Service shown in \u201cNext open appointments\u201d", {
        hint: "The top of the home page shows the next open times for this service.",
        options: allFormServices().map(function (s) { return { value: s.id, label: s.name.trim() || "Untitled service" }; })
      }));

      state.form.serviceGroups.forEach(function (group, gi) {
        var g = el("div", { class: "svc-group" });
        g.appendChild(field("serviceGroups." + gi + ".name", "Group name", { inputClass: "input--group" }));
        var ul = el("ul", { class: "svc-list", role: "list" });
        if (!group.services.length) ul.appendChild(el("li", { class: "svc-list__empty", text: "No services in this group. It's hidden on the site until you add one." }));
        group.services.forEach(function (s, si) {
          ul.appendChild(serviceItem(group, gi, s, si));
        });
        g.appendChild(ul);
        g.appendChild(actionButton("svc-add", "Add a service to " + (group.name.trim() || "this group"), { group: String(gi) }, { class: "button button--line" }));
        box.appendChild(g);
      });
    },

    photos: function (box) {
      box.appendChild(photoSlot("heroImage", "Top of the page", "Shown next to Next open appointments."));
      var gal = el("div", { class: "photo-edit-group" });
      gal.appendChild(el("h3", { class: "edit-subtitle", text: "Photo row" }));
      gal.appendChild(el("p", { class: "field__hint", text: "Shown between the services and booking. Up to six look best." }));
      var ul = el("ul", { class: "photo-list", role: "list" });
      state.form.gallery.forEach(function (img, i) {
        var tools = el("div", { class: "photo-edit__tools" },
          i > 0 ? actionButton("gallery-up", "Move up", { index: String(i) }, { label: "Move photo " + (i + 1) + " up" }) : null,
          i < state.form.gallery.length - 1 ? actionButton("gallery-down", "Move down", { index: String(i) }, { label: "Move photo " + (i + 1) + " down" }) : null,
          actionButton("gallery-remove", "Remove photo", { index: String(i) }, { label: "Remove photo " + (i + 1) })
        );
        ul.appendChild(el("li", { class: "photo-list__item" }, photoFields("gallery." + i, "Photo " + (i + 1), tools)));
      });
      gal.appendChild(ul);
      gal.appendChild(actionButton("gallery-add", "Add a photo", null, { class: "button button--line" }));
      box.appendChild(gal);
      box.appendChild(photoSlot("portrait", "About section", "A photo of you."));
    },

    file: function (box) {
      box.appendChild(el("div", { class: "file-block" },
        el("h3", { class: "edit-subtitle", text: "Download settings file" }),
        el("p", { class: "edit-section__lede", text: "Saves everything as a config.js file. Put it in place of js/config.js on the site (or send it to whoever looks after the site), and every visitor sees your changes." }),
        isDirty() ? el("p", { class: "field-error field-error--warning" }, el("span", { class: "field-error__tag", text: "Check: " }), "You have unsaved changes. The file includes only saved changes.") : null,
        el("div", { class: "flow-actions" }, actionButton("download", "Download settings file", null, { class: "button button--line" }))
      ));

      var reset = el("div", { class: "file-block" },
        el("h3", { class: "edit-subtitle", text: "Reset to original" }),
        el("p", { class: "edit-section__lede", text: "Goes back to the details in js/config.js." }));
      if (state.confirm && state.confirm.kind === "reset") {
        reset.appendChild(el("div", { class: "confirm", role: "group", "aria-labelledby": "reset-q" },
          el("p", { id: "reset-q", class: "confirm__q", text: "Reset to original? Every change saved on this page in this browser is removed: business details, contact details, hours, booking rules, policies, services and photos. Appointments aren't affected. This can't be undone." }),
          el("div", { class: "confirm__buttons" },
            actionButton("reset-yes", "Yes, reset to original", null, { class: "button button--line" }),
            actionButton("reset-no", "Keep my changes", null, { class: "button button--line" }))
        ));
      } else {
        reset.appendChild(el("div", { class: "flow-actions" }, actionButton("reset", "Reset to original", null, { class: "button button--line" })));
      }
      box.appendChild(reset);
    }
  };

  function allFormServices() {
    var out = [];
    state.form.serviceGroups.forEach(function (g) { g.services.forEach(function (s) { out.push(s); }); });
    return out;
  }

  function summaryMeta(s) {
    var mins = Settings.toInt(s.minutes), price = Settings.toPrice(s.price);
    var parts = [];
    parts.push(isNaN(mins) ? "length not set" : Settings.durationText(mins));
    parts.push(isNaN(price) ? "price not set" : (s.priceFrom ? "from " : "") + "$" + (price % 1 === 0 ? price : price.toFixed(2)));
    return parts.join(", ");
  }

  function serviceHasProblem(gi, si) {
    var prefix = "serviceGroups." + gi + ".services." + si + ".";
    return Object.keys(state.errors).some(function (k) { return k.indexOf(prefix) === 0; });
  }

  function serviceItem(group, gi, s, si) {
    var base = "serviceGroups." + gi + ".services." + si;
    var open = !!state.expanded[s.id];
    var bodyId = "svc-body-" + s.id;
    var name = s.name.trim() || "Untitled service";
    var li = el("li", { class: "svc" + (open ? " is-open" : ""), dataset: { id: s.id } });

    var toggle = el("button", {
      type: "button", class: "svc__toggle", "aria-expanded": String(open), "aria-controls": bodyId,
      dataset: { action: "svc-toggle", id: s.id }
    },
      el("span", { class: "svc__name", text: name }),
      el("span", { class: "svc__meta", text: summaryMeta(s) }),
      serviceHasProblem(gi, si) ? el("span", { class: "svc__flag", text: "Needs a change" }) : null,
      el("span", { class: "sr-only", text: open ? ", editing" : ", select to edit" })
    );

    li.appendChild(el("div", { class: "svc__row" }, toggle,
      el("div", { class: "svc__tools" },
        si > 0 ? actionButton("svc-up", "Move up", { id: s.id }, { label: "Move " + name + " up" }) : null,
        si < group.services.length - 1 ? actionButton("svc-down", "Move down", { id: s.id }, { label: "Move " + name + " down" }) : null,
        actionButton("svc-remove", "Remove", { id: s.id }, { label: "Remove " + name })
      )
    ));

    if (state.confirm && state.confirm.kind === "service" && state.confirm.id === s.id) {
      li.appendChild(el("div", { class: "confirm", role: "group", "aria-labelledby": "confirm-" + s.id },
        el("p", { class: "confirm__q", id: "confirm-" + s.id, text: "Remove " + name + "? It disappears from the site. Appointments already booked for it keep their details." }),
        el("div", { class: "confirm__buttons" },
          actionButton("svc-remove-yes", "Yes, remove service", { id: s.id }, { class: "button button--line" }),
          actionButton("svc-remove-no", "Keep service", { id: s.id }, { class: "button button--line" }))
      ));
    }

    var body = el("div", { class: "svc__body", id: bodyId, hidden: !open });
    if (open) {
      var mins = Settings.toInt(s.minutes);
      body.appendChild(el("div", { class: "edit-fields" },
        field(base + ".name", "Service name"),
        field(base + ".description", "One-line description", { optional: true, wide: true }),
        field(base + ".minutes", "Length in minutes", {
          type: "number", attrs: { min: "5", max: "600", step: "5", inputmode: "numeric" },
          after: el("p", { class: "field__hint svc__duration", dataset: { durationFor: base + ".minutes" }, "aria-live": "polite",
            text: isNaN(mins) ? "" : "Shown as " + Settings.durationText(mins) })
        }),
        field(base + ".price", "Price in dollars", { type: "number", attrs: { min: "0", step: "0.01", inputmode: "decimal" } }),
        el("div", { class: "field field--check" }, checkbox(base + ".priceFrom", "Show as a starting price (\u201cfrom $" + (s.price || "0") + "\u201d)")),
        field("move:" + s.id, "Group", {
          options: state.form.serviceGroups.map(function (g, i) { return { value: String(i), label: g.name.trim() || "Group " + (i + 1) }; })
        })
      ));
      var select = body.querySelector("select[data-path='move:" + s.id + "']");
      if (select) select.value = String(gi);
    }
    li.appendChild(body);
    return li;
  }

  function photoFields(path, label, tools) {
    var img = getPath(state.form, path);
    var thumb = el("figure", { class: "thumb", dataset: { thumbFor: path } });
    fillThumb(thumb, img && img.src);
    return el("div", { class: "photo-edit" },
      thumb,
      el("div", { class: "photo-edit__fields" },
        label ? el("p", { class: "photo-edit__label", text: label }) : null,
        field(path + ".src", "Image address", { attrs: { inputmode: "url", spellcheck: "false", autocapitalize: "off" } }),
        field(path + ".alt", "Description of the photo", { hint: "For people who use screen readers." }),
        tools
      )
    );
  }

  function photoSlot(path, label, hint) {
    var wrap = el("div", { class: "photo-edit-group" }, el("h3", { class: "edit-subtitle", text: label }),
      el("p", { class: "field__hint", text: hint }));
    if (state.form[path]) {
      wrap.appendChild(photoFields(path, null, el("div", { class: "photo-edit__tools" },
        actionButton("photo-remove", "Remove photo", { path: path }, { label: "Remove photo: " + label }))));
    } else {
      wrap.appendChild(el("p", { class: "photo-edit__none", text: "No photo. This spot is hidden on the site." }));
      wrap.appendChild(actionButton("photo-add", "Add a photo", { path: path }, { class: "button button--line", label: "Add a photo: " + label }));
    }
    return wrap;
  }

  function fillThumb(fig, src) {
    clear(fig);
    fig.classList.remove("is-error");
    src = (src || "").trim();
    if (!src) {
      fig.appendChild(el("figcaption", { class: "thumb__note", text: "No image address yet" }));
      return;
    }
    if (!Settings.isSafeImageSrc(src)) {
      fig.classList.add("is-error");
      fig.appendChild(el("figcaption", { class: "thumb__note", text: "This address can't be used" }));
      return;
    }
    var img = el("img", { src: src, alt: "", width: "160", height: "200", loading: "lazy", decoding: "async" });
    img.addEventListener("error", function () {
      if (img.parentNode) img.parentNode.removeChild(img);
      fig.classList.add("is-error");
      fig.appendChild(el("figcaption", { class: "thumb__note", text: "This image could not be loaded. Check the address." }));
    });
    fig.appendChild(img);
  }

  /* ---------- Rendering ---------- */

  function render(sections, focusSelector) {
    var active = document.activeElement;
    var activeId = active && formNode.contains(active) ? active.id : null;
    (sections || Object.keys(renderers)).forEach(function (name) {
      var box = formNode.querySelector('[data-section="' + name + '"]');
      clear(box);
      renderers[name](box);
    });
    updateSavebar();
    var target = focusSelector ? formNode.querySelector(focusSelector) : (activeId ? document.getElementById(activeId) : null);
    if (target) target.focus();
  }

  function updateSavebar() {
    var dirty = isDirty();
    savebar.classList.toggle("is-dirty", dirty);
    savebar.classList.toggle("is-clean", !dirty);
    discardButton.hidden = !dirty;
    if (dirty) { state.justSaved = false; savebarStatus.textContent = "Unsaved changes"; }
    else savebarStatus.textContent = state.justSaved ? "Changes saved" : "No unsaved changes";
    // Keep the download note in step with the dirty state.
    var fileBox = formNode.querySelector('[data-section="file"]');
    var hasNote = !!fileBox.querySelector(".field-error--warning");
    if (hasNote !== dirty && !(state.confirm && state.confirm.kind === "reset")) {
      var focused = document.activeElement && fileBox.contains(document.activeElement) ? document.activeElement.dataset.action : null;
      clear(fileBox);
      renderers.file(fileBox);
      if (focused) { var b = fileBox.querySelector('[data-action="' + focused + '"]'); if (b) b.focus(); }
    }
  }

  // Remove messages that the latest edit fixed (new problems wait until Save).
  function refreshMessages() {
    if (!Object.keys(state.errors).length && !Object.keys(state.warnings).length) return;
    var fresh = Settings.validateForm(state.form);
    [["errors", fresh.errors], ["warnings", fresh.warnings]].forEach(function (pair) {
      Object.keys(state[pair[0]]).forEach(function (path) {
        if (!pair[1][path]) delete state[pair[0]][path];
        else state[pair[0]][path] = pair[1][path];
      });
    });
    formNode.querySelectorAll("[data-msg-for]").forEach(function (node) {
      var path = node.dataset.msgFor;
      var err = state.errors[path], warn = state.warnings[path];
      if (!err && !warn) {
        node.hidden = true;
        var input = document.getElementById(idFor(path));
        if (input) {
          input.removeAttribute("aria-invalid");
          var ids = (input.getAttribute("aria-describedby") || "").split(" ").filter(function (x) { return x && x !== node.id; });
          if (ids.length) input.setAttribute("aria-describedby", ids.join(" ")); else input.removeAttribute("aria-describedby");
        }
      }
    });
  }

  /* ---------- Editing ---------- */

  var thumbTimers = {};

  function onInput(event) {
    var t = event.target;
    var path = t.dataset && t.dataset.path;
    if (!path) return;

    if (path.indexOf("move:") === 0) {
      if (event.type === "change") moveToGroup(path.slice(5), Number(t.value));
      return;
    }

    var value = t.type === "checkbox" ? t.checked : t.value;
    setPath(state.form, path, value);

    // An edited image address no longer matches its stock-photo source note.
    if (/\.src$/.test(path)) {
      var parent = getPath(state.form, path.replace(/\.src$/, ""));
      if (parent) parent.source = "";
      var key = path.replace(/\.src$/, "");
      window.clearTimeout(thumbTimers[key]);
      thumbTimers[key] = window.setTimeout(function () {
        var fig = formNode.querySelector('[data-thumb-for="' + key + '"]');
        if (fig) fillThumb(fig, t.value);
      }, 400);
    }

    var svc = /^serviceGroups\.(\d+)\.services\.(\d+)\.(\w+)$/.exec(path);
    if (svc) updateServiceSummary(+svc[1], +svc[2], svc[3], t);

    if (/^hours\.\w+\.open$/.test(path) && event.type === "change") {
      render(["hours"], "#" + idFor(path));
      announce(DAY_LABEL[path.split(".")[1]] + (value ? " open." : " closed."));
    }
    if (/^serviceGroups\.\d+\.name$/.test(path) && event.type === "change") {
      render(["services"], "#" + idFor(path));
    }

    refreshMessages();
    updateSavebar();
  }

  function updateServiceSummary(gi, si, key, input) {
    var s = state.form.serviceGroups[gi].services[si];
    var li = formNode.querySelector('.svc[data-id="' + s.id + '"]');
    if (!li) return;
    li.querySelector(".svc__name").textContent = s.name.trim() || "Untitled service";
    li.querySelector(".svc__meta").textContent = summaryMeta(s);
    if (key === "minutes") {
      var out = li.querySelector(".svc__duration");
      var m = Settings.toInt(s.minutes);
      if (out) out.textContent = isNaN(m) ? "" : "Shown as " + Settings.durationText(m);
    }
    if (key === "name") {
      var opt = formNode.querySelector('select[data-path="heroServiceId"] option[value="' + cssEscape(s.id) + '"]');
      if (opt) opt.textContent = s.name.trim() || "Untitled service";
    }
    if (key === "price") {
      var label = li.querySelector('label[for="' + idFor("serviceGroups." + gi + ".services." + si + ".priceFrom") + '"]');
      if (label) label.firstChild.textContent = "Show as a starting price (\u201cfrom $" + (s.price || "0") + "\u201d)";
    }
  }

  function cssEscape(v) { return window.CSS && CSS.escape ? CSS.escape(v) : String(v).replace(/["\\]/g, "\\$&"); }

  function findService(id) {
    for (var gi = 0; gi < state.form.serviceGroups.length; gi++) {
      var list = state.form.serviceGroups[gi].services;
      for (var si = 0; si < list.length; si++) if (list[si].id === id) return { gi: gi, si: si, list: list, service: list[si] };
    }
    return null;
  }

  function moveToGroup(id, target) {
    var found = findService(id);
    if (!found || found.gi === target || !state.form.serviceGroups[target]) return;
    found.list.splice(found.si, 1);
    state.form.serviceGroups[target].services.push(found.service);
    state.errors = {}; state.warnings = {};
    render(["services"], 'select[data-path="move:' + cssEscape(id) + '"]');
    announce((found.service.name || "Service") + " moved to " + (state.form.serviceGroups[target].name || "the other group") + ".");
  }

  function clearMessagesUnder(prefix) {
    // Indexes shift after add/remove/move, so old messages no longer line up.
    ["errors", "warnings"].forEach(function (k) {
      Object.keys(state[k]).forEach(function (p) { if (p.indexOf(prefix) === 0) delete state[k][p]; });
    });
  }

  function onClick(event) {
    var btn = event.target.closest("[data-action]");
    if (!btn || !formNode.contains(btn)) return;
    var action = btn.dataset.action, id = btn.dataset.id, index = Number(btn.dataset.index);
    var f = state.form;

    switch (action) {
      case "save": return; // handled by submit
      case "discard": return discard();
      case "date-add":
        f.closedDates.push("");
        render(["hours"], "#" + idFor("closedDates." + (f.closedDates.length - 1)));
        break;
      case "date-remove":
        f.closedDates.splice(index, 1); clearMessagesUnder("closedDates");
        render(["hours"], f.closedDates.length ? '[data-action="date-remove"][data-index="' + Math.min(index, f.closedDates.length - 1) + '"]' : '[data-action="date-add"]');
        announce("Closed date removed.");
        break;
      case "policy-add":
        f.policies.push("");
        render(["rules"], "#" + idFor("policies." + (f.policies.length - 1)));
        break;
      case "policy-remove":
        f.policies.splice(index, 1);
        render(["rules"], f.policies.length ? '[data-action="policy-remove"][data-index="' + Math.min(index, f.policies.length - 1) + '"]' : '[data-action="policy-add"]');
        announce("Policy removed.");
        break;
      case "svc-toggle":
        state.expanded[id] = !state.expanded[id];
        render(["services"], '[data-action="svc-toggle"][data-id="' + cssEscape(id) + '"]');
        break;
      case "svc-up":
      case "svc-down": {
        var found = findService(id);
        var to = found.si + (action === "svc-up" ? -1 : 1);
        if (to < 0 || to >= found.list.length) return;
        found.list.splice(found.si, 1);
        found.list.splice(to, 0, found.service);
        clearMessagesUnder("serviceGroups");
        var sel = '[data-action="' + action + '"][data-id="' + cssEscape(id) + '"]';
        var other = '[data-action="' + (action === "svc-up" ? "svc-down" : "svc-up") + '"][data-id="' + cssEscape(id) + '"]';
        render(["services"]);
        var target = formNode.querySelector(sel) || formNode.querySelector(other);
        if (target) target.focus();
        announce((found.service.name || "Service") + " moved " + (action === "svc-up" ? "up" : "down") + ", now number " + (to + 1) + " of " + found.list.length + ".");
        break;
      }
      case "svc-add": {
        var gi = Number(btn.dataset.group);
        var ids = allFormServices().map(function (s) { return s.id; }).concat(Object.keys(DEFAULTS_IDS));
        var newId = Settings.newServiceId("service-" + Date.now().toString(36), ids);
        f.serviceGroups[gi].services.push({ id: newId, name: "", description: "", minutes: "60", price: "", priceFrom: false });
        state.expanded[newId] = true;
        render(["services"], "#" + idFor("serviceGroups." + gi + ".services." + (f.serviceGroups[gi].services.length - 1) + ".name"));
        announce("New service added to " + (f.serviceGroups[gi].name || "the group") + ". Enter its name.");
        break;
      }
      case "svc-remove":
        state.confirm = { kind: "service", id: id };
        render(["services"], '[data-action="svc-remove-yes"][data-id="' + cssEscape(id) + '"]');
        break;
      case "svc-remove-no":
        state.confirm = null;
        render(["services"], '[data-action="svc-remove"][data-id="' + cssEscape(id) + '"]');
        break;
      case "svc-remove-yes": {
        var gone = findService(id);
        var name = gone.service.name.trim() || "Untitled service";
        gone.list.splice(gone.si, 1);
        state.confirm = null;
        delete state.expanded[id];
        clearMessagesUnder("serviceGroups");
        if (f.heroServiceId === id) f.heroServiceId = (allFormServices()[0] || {}).id || "";
        render(["services"]);
        var next = gone.list[gone.si] || gone.list[gone.si - 1];
        var focusTarget = next ? formNode.querySelector('[data-action="svc-toggle"][data-id="' + cssEscape(next.id) + '"]')
          : formNode.querySelectorAll('[data-action="svc-add"]')[gone.gi];
        if (focusTarget) focusTarget.focus();
        announce(name + " removed. Save changes to update the site.");
        break;
      }
      case "photo-remove":
        f[btn.dataset.path] = null;
        clearMessagesUnder(btn.dataset.path);
        render(["photos"], '[data-action="photo-add"][data-path="' + btn.dataset.path + '"]');
        announce("Photo removed.");
        break;
      case "photo-add":
        f[btn.dataset.path] = { src: "", alt: "", source: "" };
        render(["photos"], "#" + idFor(btn.dataset.path + ".src"));
        break;
      case "gallery-add":
        f.gallery.push({ src: "", alt: "", source: "" });
        render(["photos"], "#" + idFor("gallery." + (f.gallery.length - 1) + ".src"));
        break;
      case "gallery-remove":
        f.gallery.splice(index, 1); clearMessagesUnder("gallery");
        render(["photos"], f.gallery.length ? '[data-action="gallery-remove"][data-index="' + Math.min(index, f.gallery.length - 1) + '"]' : '[data-action="gallery-add"]');
        announce("Photo removed from the photo row.");
        break;
      case "gallery-up":
      case "gallery-down": {
        var to2 = index + (action === "gallery-up" ? -1 : 1);
        var item = f.gallery.splice(index, 1)[0];
        f.gallery.splice(to2, 0, item); clearMessagesUnder("gallery");
        render(["photos"]);
        var t2 = formNode.querySelector('[data-action="' + action + '"][data-index="' + to2 + '"]') ||
          formNode.querySelector('[data-action="' + (action === "gallery-up" ? "gallery-down" : "gallery-up") + '"][data-index="' + to2 + '"]');
        if (t2) t2.focus();
        announce("Photo moved to position " + (to2 + 1) + " of " + f.gallery.length + ".");
        break;
      }
      case "download": return download();
      case "reset":
        state.confirm = { kind: "reset" };
        render(["file"], '[data-action="reset-yes"]');
        break;
      case "reset-no":
        state.confirm = null;
        render(["file"], '[data-action="reset"]');
        break;
      case "reset-yes": return resetToOriginal();
    }
    updateSavebar();
  }

  var DEFAULTS_IDS = {};
  (DEFAULTS.serviceGroups || []).forEach(function (g) { (g.services || []).forEach(function (s) { DEFAULTS_IDS[s.id] = true; }); });

  /* ---------- Save, discard, download, reset ---------- */

  function firstProblemField() {
    var nodes = formNode.querySelectorAll('[aria-invalid="true"]');
    return nodes[0] || null;
  }

  function save(event) {
    if (event) event.preventDefault();
    var result = Settings.validateForm(state.form);
    state.errors = result.errors;
    state.warnings = result.warnings;
    var errorPaths = Object.keys(state.errors);

    if (errorPaths.length) {
      // Open any service that has a problem so its field can be shown.
      errorPaths.forEach(function (p) {
        var m = /^serviceGroups\.(\d+)\.services\.(\d+)\./.exec(p);
        if (m) state.expanded[state.form.serviceGroups[+m[1]].services[+m[2]].id] = true;
      });
      render();
      var first = firstProblemField();
      var message = first ? state.errors[first.dataset.path] : state.errors[errorPaths[0]];
      if (first) { first.focus(); first.scrollIntoView({ block: "center", behavior: UI.prefersReducedMotion() ? "auto" : "smooth" }); }
      announce((errorPaths.length === 1 ? "One field needs a change before saving. " : errorPaths.length + " fields need a change before saving. ") + message, true);
      return;
    }

    var saved = Settings.fromForm(state.form);
    store.save(saved).then(function () {
      var effective = Settings.mergeSettings(DEFAULTS, saved);
      window.SITE = effective;
      state.saved = Settings.toForm(effective);
      state.form = copy(state.saved);
      state.justSaved = true;
      state.confirm = null;
      render();
      document.querySelectorAll("[data-site='name']").forEach(function (n) { n.textContent = effective.businessName; });
      document.title = "Edit site: " + effective.businessName;
      savebarStatus.focus();
      var notes = Object.keys(state.warnings).length;
      announce("Changes saved." + (notes ? " " + notes + (notes === 1 ? " note" : " notes") + " to check, marked on the page." : ""));
    }).catch(function () {
      announce("Changes couldn't be saved in this browser. Check that site storage is allowed, then select Save changes again.", true);
    });
  }

  function discard() {
    state.form = copy(state.saved);
    state.errors = {}; state.warnings = {}; state.confirm = null; state.justSaved = false;
    render();
    savebarStatus.focus();
    announce("Changes discarded. The form shows the last saved details.");
  }

  function download() {
    var today = UI.now().date;
    var text = Settings.generateConfigFile(window.SITE, { date: today });
    var blob = new Blob([text], { type: "text/javascript;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = el("a", { href: url, download: "config.js" });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    announce("Settings file downloaded as config.js.");
  }

  function resetToOriginal() {
    store.reset().then(function () {
      window.SITE = Settings.mergeSettings(DEFAULTS, null);
      state.saved = Settings.toForm(window.SITE);
      state.form = copy(state.saved);
      state.errors = {}; state.warnings = {}; state.confirm = null; state.expanded = {}; state.justSaved = false;
      render();
      document.querySelectorAll("[data-site='name']").forEach(function (n) { n.textContent = window.SITE.businessName; });
      document.title = "Edit site: " + window.SITE.businessName;
      var b = formNode.querySelector('[data-action="reset"]');
      if (b) b.focus();
      announce("Reset to original. The site shows the details from js/config.js again.");
    });
  }

  /* ---------- Wire up ---------- */

  formNode.addEventListener("input", onInput);
  formNode.addEventListener("change", onInput);
  formNode.addEventListener("click", onClick);
  formNode.addEventListener("submit", save);
  // Enter in a text field shouldn't save by surprise; only the button saves.
  formNode.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && e.target.tagName === "INPUT" && e.target.type !== "checkbox") e.preventDefault();
  });

  window.addEventListener("beforeunload", function (e) {
    if (!isDirty()) return;
    e.preventDefault();
    e.returnValue = "";
  });

  render();
})();
