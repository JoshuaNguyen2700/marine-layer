/*
  Booking flow UI and the "Next open appointments" block at the top.

  Talks to:
    window.Scheduling   - which times are open (pure logic)
    window.BookingStore - where bookings are saved (see store.js)
    window.SiteUI       - small display helpers (see site.js)
*/
(function () {
  "use strict";

  var SITE = window.SITE, S = window.Scheduling, store = window.BookingStore, UI = window.SiteUI;
  var el = UI.el, clear = UI.clear, has = UI.has;

  var root = document.getElementById("booking-flow");
  if (!root) return;

  var statusRegion = document.getElementById("flow-status"); // polite
  var alertRegion = document.getElementById("flow-alert");   // assertive

  var STEP_TITLES = {
    1: "Choose a service",
    2: "Choose a day and time",
    3: "Your details",
    4: "Review and confirm"
  };

  var state = {
    step: 1,
    serviceId: null,
    date: null,
    start: null,
    view: null,          // { year, month } shown in the calendar
    focusDate: null,     // day that holds keyboard focus in the calendar
    details: { name: "", phone: "", email: "", notes: "" },
    errors: {},
    notice: "",          // message shown at the top of step 2 (e.g. slot just taken)
    bookings: [],
    confirmed: null,
    busy: false
  };

  /* ---------- Small utilities ---------- */

  function service() { return UI.findService(state.serviceId); }

  function announce(message, assertive) {
    var region = assertive ? alertRegion : statusRegion;
    if (!region) return;
    region.textContent = "";
    // A short delay makes screen readers treat repeated text as new.
    window.setTimeout(function () { region.textContent = message; }, 60);
  }

  function refreshBookings() {
    return store.listBookings().then(function (list) { state.bookings = list; return list; });
  }

  function slotsFor(dateKey, serviceObj) {
    return S.openSlots(SITE, {
      date: dateKey, duration: serviceObj.minutes, bookings: state.bookings, now: UI.now()
    });
  }

  function whenText(dateKey, start) {
    return UI.formatDate(dateKey) + " at " + UI.formatTime(start);
  }

  function scrollToFlow() {
    var section = document.getElementById("book");
    if (section) section.scrollIntoView({ behavior: UI.prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  }

  function focusNode(node) {
    if (!node) return;
    node.focus({ preventScroll: true });
  }

  // Scroll a node into view only if it's outside the viewport.
  function revealNode(node) {
    if (!node) return;
    var rect = node.getBoundingClientRect();
    if (rect.top < 0 || rect.top > window.innerHeight * 0.6) {
      node.scrollIntoView({ behavior: UI.prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    }
  }

  /* ---------- Rendering the step frame ---------- */

  var stepNodes = {};
  Array.prototype.forEach.call(root.querySelectorAll(".step"), function (node) {
    stepNodes[node.dataset.step] = {
      node: node,
      title: node.querySelector(".step__title"),
      summary: node.querySelector(".step__summary"),
      body: node.querySelector(".step__body")
    };
  });
  var stepsList = root.querySelector(".steps");
  var doneNode = document.getElementById("flow-done");

  function summaryFor(step) {
    var s = service();
    if (step === 1 && s) return s.name + ", " + UI.formatDuration(s.minutes) + ", " + UI.formatPrice(s);
    if (step === 2 && state.date != null && state.start != null) return whenText(state.date, state.start) + " " + SITE.timeZoneLabel;
    if (step === 3) {
      var d = state.details;
      return [d.name, d.phone, d.email].filter(has).join(", ");
    }
    return "";
  }

  function render() {
    if (state.confirmed) {
      stepsList.hidden = true;
      doneNode.hidden = false;
      renderDone();
      return;
    }
    stepsList.hidden = false;
    doneNode.hidden = true;

    [1, 2, 3, 4].forEach(function (n) {
      var parts = stepNodes[n];
      var current = n === state.step, done = n < state.step;
      parts.node.classList.toggle("is-current", current);
      parts.node.classList.toggle("is-done", done);
      parts.node.classList.toggle("is-upcoming", n > state.step);
      if (current) parts.node.setAttribute("aria-current", "step");
      else parts.node.removeAttribute("aria-current");

      clear(parts.summary);
      if (done) {
        parts.summary.hidden = false;
        parts.summary.appendChild(el("p", { class: "step__summary-text", text: summaryFor(n) }));
        parts.summary.appendChild(el("button", {
          type: "button", class: "link-button", text: "Change",
          "aria-label": "Change " + STEP_TITLES[n].toLowerCase().replace(/^choose an? /, "").replace(/^your /, "your "),
          onclick: function () { goTo(n); }
        }));
      } else {
        parts.summary.hidden = true;
      }

      clear(parts.body);
      parts.body.hidden = !current;
    });

    var body = stepNodes[state.step].body;
    if (state.step === 1) renderServiceStep(body);
    if (state.step === 2) renderTimeStep(body);
    if (state.step === 3) renderDetailsStep(body);
    if (state.step === 4) renderReviewStep(body);
  }

  function goTo(step, opts) {
    opts = opts || {};
    state.step = step;
    state.errors = {};
    if (step !== 2 && !opts.keepNotice) state.notice = "";
    render();
    var title = stepNodes[step].title;
    if (!opts.noFocus) {
      focusNode(title);
      if (!opts.skipScroll) revealNode(title);
    }
    var message = "Step " + step + " of 4: " + STEP_TITLES[step] + ".";
    if (opts.message) message += " " + opts.message;
    announce(message, !!opts.assertive);
  }

  /* ---------- Step 1: service ---------- */

  function renderServiceStep(body) {
    var form = el("form", { class: "flow-form", novalidate: true });
    var errorId = "service-error";

    if (!UI.services().length) {
      body.appendChild(el("p", { class: "flow-hint", text: "No services are open for booking yet." }));
      return;
    }
    (SITE.serviceGroups || []).forEach(function (group, gi) {
      if (!(group.services || []).length) return;
      var fieldset = el("fieldset", { class: "choices", "aria-describedby": state.errors.service ? errorId : null },
        el("legend", { class: "choices__legend", text: group.name }));
      (group.services || []).forEach(function (s) {
        var id = "svc-" + s.id;
        fieldset.appendChild(el("div", { class: "choice" },
          el("input", {
            type: "radio", name: "service", id: id, value: s.id, class: "choice__input",
            checked: state.serviceId === s.id
          }),
          el("label", { for: id, class: "choice__label" },
            el("span", { class: "choice__name", text: s.name }),
            el("span", { class: "choice__meta" },
              el("span", { text: UI.formatDuration(s.minutes) }),
              el("span", { class: "choice__price", text: UI.formatPrice(s) }))
          )
        ));
      });
      form.appendChild(fieldset);
    });

    form.appendChild(errorText(errorId, state.errors.service));
    form.appendChild(el("div", { class: "flow-actions" },
      el("button", { type: "submit", class: "button button--primary", text: "Continue to day and time" })));

    form.addEventListener("change", function (e) {
      if (e.target.name === "service") {
        state.serviceId = e.target.value;
        state.date = null; state.start = null; state.view = null; state.focusDate = null;
        if (state.errors.service) { state.errors.service = ""; var msg = form.querySelector("#" + errorId); if (msg) msg.hidden = true; }
      }
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!service()) {
        state.errors.service = "Choose a service to see its open times.";
        renderServiceStep(clear(body));
        var first = body.querySelector("input[name=service]");
        focusNode(first);
        announce(state.errors.service, true);
        return;
      }
      goTo(2, { message: service().name + " selected." });
    });

    body.appendChild(form);
  }

  function errorText(id, message) {
    return el("p", { class: "field-error", id: id, hidden: !message, text: message || "" });
  }

  /* ---------- Step 2: day and time ---------- */

  function rangeInfo() {
    var now = UI.now();
    var range = S.bookingRange(SITE, now);
    var first = S.parseDateKey(range.first), last = S.parseDateKey(range.last);
    return {
      now: now, first: range.first, last: range.last,
      firstMonth: { year: first.year, month: first.month },
      lastMonth: { year: last.year, month: last.month }
    };
  }

  function monthIndex(m) { return m.year * 12 + (m.month - 1); }

  function ensureView() {
    var info = rangeInfo();
    if (state.view && monthIndex(state.view) >= monthIndex(info.firstMonth) && monthIndex(state.view) <= monthIndex(info.lastMonth)) return;
    var target = state.date;
    if (!target) {
      var next = S.nextOpenDays(SITE, { count: 1, duration: service().minutes, bookings: state.bookings, now: info.now });
      target = next.length ? next[0].date : info.first;
    }
    var p = S.parseDateKey(target);
    state.view = { year: p.year, month: p.month };
  }

  function renderTimeStep(body, focusSelector) {
    var s = service();
    if (!s) { goTo(1); return; }
    ensureView();
    var info = rangeInfo();
    var view = state.view;
    var availability = S.monthAvailability(SITE, {
      year: view.year, month: view.month, duration: s.minutes, bookings: state.bookings, now: info.now
    });

    // If the chosen time is no longer open (taken in another tab), drop it.
    if (state.date && state.start != null) {
      var still = S.isSlotOpen(SITE, { date: state.date, start: state.start, duration: s.minutes, bookings: state.bookings, now: info.now });
      if (!still) state.start = null;
    }

    if (state.notice) {
      // Announced through the live region by goTo(); shown here for sighted users.
      body.appendChild(el("p", { class: "flow-notice", text: state.notice }));
    }

    body.appendChild(el("p", { class: "flow-hint" },
      "Days you can book are shown in white. Times are in " + SITE.timeZoneLabel + "."));

    var layout = el("div", { class: "picker" });
    layout.appendChild(renderCalendar(availability, info));
    layout.appendChild(renderTimes(availability));
    body.appendChild(layout);

    body.appendChild(errorText("time-error", state.errors.time));
    var actions = el("div", { class: "flow-actions" },
      el("button", { type: "button", class: "button button--primary", text: "Continue to your details", onclick: submitTime }));
    body.appendChild(actions);

    if (focusSelector) focusNode(body.querySelector(focusSelector));
  }

  function rerenderTimeStep(focusSelector) {
    var body = stepNodes[2].body;
    clear(body);
    renderTimeStep(body, focusSelector);
  }

  function renderCalendar(availability, info) {
    var view = state.view;
    var monthLabelId = "cal-month-label";
    var wrap = el("div", { class: "cal" });

    var canPrev = monthIndex(view) > monthIndex(info.firstMonth);
    var canNext = monthIndex(view) < monthIndex(info.lastMonth);

    wrap.appendChild(el("div", { class: "cal__head" },
      el("h4", { class: "cal__month", id: monthLabelId, text: UI.formatMonth(view.year, view.month) }),
      el("div", { class: "cal__nav" },
        navButton("prev", "Previous month", canPrev),
        navButton("next", "Next month", canNext))
    ));

    var table = el("table", { class: "cal__grid", role: "grid", "aria-labelledby": monthLabelId });
    var headRow = el("tr");
    ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].forEach(function (d) {
      headRow.appendChild(el("th", { scope: "col", abbr: d },
        el("span", { "aria-hidden": "true", text: d.slice(0, 2) }),
        el("span", { class: "sr-only", text: d })));
    });
    table.appendChild(el("thead", null, headRow));

    // Which day gets tabindex=0 (roving focus)
    var keys = Object.keys(availability);
    var focusKey = null;
    if (state.focusDate && availability[state.focusDate]) focusKey = state.focusDate;
    else if (state.date && availability[state.date]) focusKey = state.date;
    else focusKey = keys.filter(function (k) { return availability[k].length; })[0] || keys[0];
    state.focusDate = focusKey;

    var tbody = el("tbody");
    var firstWeekday = S.weekday(S.dateKey(view.year, view.month, 1));
    var total = S.daysInMonth(view.year, view.month);
    var row = el("tr");
    for (var i = 0; i < firstWeekday; i++) row.appendChild(el("td", { class: "cal__pad" }));
    for (var day = 1; day <= total; day++) {
      var key = S.dateKey(view.year, view.month, day);
      var open = availability[key].length;
      var selected = key === state.date;
      var label = UI.formatDate(key) + (open
        ? ", " + open + (open === 1 ? " open time" : " open times")
        : ", no open times");
      var btn = el("button", {
        type: "button", class: "day" + (open ? " is-open" : "") + (selected ? " is-selected" : ""),
        tabindex: key === focusKey ? "0" : "-1",
        "aria-label": label,
        "aria-pressed": selected ? "true" : "false",
        "aria-disabled": open ? null : "true",
        "aria-current": key === info.now.date ? "date" : null,
        dataset: { date: key },
        text: String(day)
      });
      row.appendChild(el("td", null, btn));
      if ((firstWeekday + day) % 7 === 0) { tbody.appendChild(row); row = el("tr"); }
    }
    if (row.children.length) {
      while (row.children.length < 7) row.appendChild(el("td", { class: "cal__pad" }));
      tbody.appendChild(row);
    }
    table.appendChild(tbody);
    wrap.appendChild(table);

    table.addEventListener("click", function (e) {
      var btn = e.target.closest(".day");
      if (!btn) return;
      pickDay(btn.dataset.date, availability);
    });
    table.addEventListener("keydown", function (e) { onCalendarKey(e, info); });

    return wrap;
  }

  function navButton(dir, label, enabled) {
    var path = dir === "prev" ? "M10 3 5 8l5 5" : "M6 3l5 5-5 5";
    var btn = el("button", {
      type: "button", class: "cal__nav-button", "aria-label": label,
      "aria-disabled": enabled ? null : "true",
      dataset: { dir: dir }
    });
    btn.appendChild(chevron(path));
    btn.addEventListener("click", function () {
      if (!enabled) return;
      shiftMonth(dir === "prev" ? -1 : 1, '[data-dir="' + dir + '"]');
    });
    return btn;
  }

  function chevron(d) {
    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    [["viewBox", "0 0 16 16"], ["width", "16"], ["height", "16"], ["aria-hidden", "true"], ["focusable", "false"]]
      .forEach(function (a) { svg.setAttribute(a[0], a[1]); });
    var p = document.createElementNS(NS, "path");
    [["d", d], ["fill", "none"], ["stroke", "currentColor"], ["stroke-width", "1.5"], ["stroke-linecap", "round"], ["stroke-linejoin", "round"]]
      .forEach(function (a) { p.setAttribute(a[0], a[1]); });
    svg.appendChild(p);
    return svg;
  }

  function shiftMonth(delta, focusSelector) {
    var idx = monthIndex(state.view) + delta;
    state.view = { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
    state.focusDate = null;
    rerenderTimeStep(focusSelector);
    announce(UI.formatMonth(state.view.year, state.view.month));
  }

  function pickDay(key, availability) {
    var slots = availability[key] || [];
    state.focusDate = key;
    if (!slots.length) {
      announce(UI.formatDate(key) + " has no open times. Choose a day shown in white.");
      return;
    }
    if (state.date !== key) state.start = null;
    state.date = key;
    state.notice = "";
    state.errors.time = "";
    rerenderTimeStep('.day[data-date="' + key + '"]');
    announce(UI.formatDate(key) + " selected. " + slots.length + (slots.length === 1 ? " open time" : " open times") + " listed below the calendar.");
  }

  function onCalendarKey(e, info) {
    var btn = e.target.closest(".day");
    if (!btn) return;
    var key = btn.dataset.date;
    var target = null;
    switch (e.key) {
      case "ArrowLeft": target = S.addDays(key, -1); break;
      case "ArrowRight": target = S.addDays(key, 1); break;
      case "ArrowUp": target = S.addDays(key, -7); break;
      case "ArrowDown": target = S.addDays(key, 7); break;
      case "Home": target = S.addDays(key, -S.weekday(key)); break;
      case "End": target = S.addDays(key, 6 - S.weekday(key)); break;
      case "PageUp": target = shiftKeyMonth(key, -1); break;
      case "PageDown": target = shiftKeyMonth(key, 1); break;
      default: return;
    }
    e.preventDefault();
    // Keep keyboard focus inside the months people can book.
    var firstOfRange = S.dateKey(info.firstMonth.year, info.firstMonth.month, 1);
    var lastOfRange = S.dateKey(info.lastMonth.year, info.lastMonth.month, S.daysInMonth(info.lastMonth.year, info.lastMonth.month));
    if (S.dayNumber(target) < S.dayNumber(firstOfRange)) target = firstOfRange;
    if (S.dayNumber(target) > S.dayNumber(lastOfRange)) target = lastOfRange;
    if (target === key) return;

    var p = S.parseDateKey(target);
    state.focusDate = target;
    if (p.year !== state.view.year || p.month !== state.view.month) {
      state.view = { year: p.year, month: p.month };
      rerenderTimeStep('.day[data-date="' + target + '"]');
      announce(UI.formatMonth(p.year, p.month));
    } else {
      var table = btn.closest("table");
      var next = table.querySelector('.day[data-date="' + target + '"]');
      btn.setAttribute("tabindex", "-1");
      next.setAttribute("tabindex", "0");
      focusNode(next);
    }
  }

  function shiftKeyMonth(key, delta) {
    var p = S.parseDateKey(key);
    var idx = p.year * 12 + (p.month - 1) + delta;
    var y = Math.floor(idx / 12), m = (idx % 12) + 1;
    return S.dateKey(y, m, Math.min(p.day, S.daysInMonth(y, m)));
  }

  function renderTimes(availability) {
    var wrap = el("div", { class: "times" });
    if (!state.date || !(availability[state.date] || []).length) {
      // Selected date may sit in another month than the one on view.
      if (state.date && !availability.hasOwnProperty(state.date)) {
        var s = service();
        var slotsOther = slotsFor(state.date, s);
        if (slotsOther.length) return renderTimeList(wrap, state.date, slotsOther);
      }
      wrap.appendChild(el("p", { class: "times__empty", text: "Choose a day to see its open start times." }));
      return wrap;
    }
    return renderTimeList(wrap, state.date, availability[state.date]);
  }

  function renderTimeList(wrap, dateKey, slots) {
    var fieldset = el("fieldset", { class: "times__set", "aria-describedby": state.errors.time ? "time-error" : null });
    fieldset.appendChild(el("legend", { class: "times__legend" },
      el("span", { class: "times__day", text: "Open times on " + UI.formatDate(dateKey) }),
      el("span", { class: "times__zone", text: SITE.timeZoneLabel })));

    var groups = [
      { label: "Morning", test: function (m) { return m < 720; } },
      { label: "Afternoon", test: function (m) { return m >= 720 && m < 1020; } },
      { label: "Evening", test: function (m) { return m >= 1020; } }
    ];
    groups.forEach(function (g, gi) {
      var list = slots.filter(g.test);
      if (!list.length) return;
      var groupId = "times-group-" + gi;
      var ul = el("ul", { class: "times__list", role: "list", "aria-labelledby": groupId });
      list.forEach(function (m) {
        var id = "time-" + dateKey + "-" + m;
        ul.appendChild(el("li", { class: "time" },
          el("input", { type: "radio", name: "start-time", id: id, value: String(m), class: "time__input", checked: state.start === m }),
          el("label", { for: id, class: "time__label", text: UI.formatTime(m) })));
      });
      fieldset.appendChild(el("div", { class: "times__group" },
        el("p", { class: "times__group-label", id: groupId, text: g.label }), ul));
    });

    fieldset.addEventListener("change", function (e) {
      if (e.target.name !== "start-time") return;
      state.start = Number(e.target.value);
      if (state.errors.time) {
        state.errors.time = "";
        var err = document.getElementById("time-error");
        if (err) err.hidden = true;
        fieldset.removeAttribute("aria-describedby");
      }
    });
    wrap.appendChild(fieldset);
    return wrap;
  }

  function submitTime() {
    if (!state.date) {
      state.errors.time = "Choose a day in the calendar, then a start time.";
      rerenderTimeStep('.day[tabindex="0"]');
      announce(state.errors.time, true);
      return;
    }
    if (state.start == null) {
      state.errors.time = "Choose a start time for " + UI.formatDate(state.date) + ".";
      rerenderTimeStep(".time__input");
      announce(state.errors.time, true);
      return;
    }
    state.notice = "";
    goTo(3, { message: whenText(state.date, state.start) + " selected." });
  }

  /* ---------- Step 3: details ---------- */

  var FIELDS = [
    { name: "name", label: "Name", type: "text", autocomplete: "name", required: true },
    { name: "phone", label: "Mobile number", type: "tel", autocomplete: "tel", inputmode: "tel", required: true,
      hint: "In case the appointment needs to change." },
    { name: "email", label: "Email", type: "email", autocomplete: "email", inputmode: "email", required: true },
    { name: "notes", label: "Notes", optional: true, multiline: true,
      hint: "Anything useful to know before the appointment, such as hair history or allergies." }
  ];

  function validate(name, raw) {
    var value = String(raw || "").trim();
    if (name === "name") {
      if (!value) return "Enter the name to book the appointment under.";
      if (value.length > 80) return "Shorten your name to 80 characters or fewer.";
      return "";
    }
    if (name === "phone") {
      if (!value) return "Enter your mobile number, for example 415 555 0123.";
      if (/[a-z]/i.test(value)) return "Use only numbers in your mobile number, for example 415 555 0123.";
      var digits = value.replace(/\D/g, "");
      if (value.charAt(0) === "+") {
        if (digits.length < 8 || digits.length > 15) return "International numbers have 8 to 15 digits after the +. Check the number and country code.";
        return "";
      }
      if (digits.length === 11 && digits.charAt(0) === "1") return "";
      if (digits.length !== 10) {
        return "This number has " + digits.length + (digits.length === 1 ? " digit" : " digits") +
          ". A US mobile number has 10, for example 415 555 0123. For a number outside the US, start with + and the country code.";
      }
      return "";
    }
    if (name === "email") {
      if (!value) return "Enter your email address, for example name@example.com.";
      if (/\s/.test(value)) return "Remove the space from your email address.";
      var at = value.indexOf("@");
      if (at === -1) return "Add the @ to your email address, for example name@example.com.";
      if (value.indexOf("@", at + 1) !== -1) return "Use only one @ in your email address.";
      if (at === 0) return "Add the part before the @, for example name@example.com.";
      var domain = value.slice(at + 1);
      if (!domain) return "Add the part after the @, for example name@example.com.";
      if (!/^[^.]+(\.[^.]+)+$/.test(domain) || /\.[a-z]?$/i.test(domain)) return "Finish the part after the @, for example example.com.";
      return "";
    }
    if (name === "notes") {
      if (value.length > 500) return "Shorten your notes to 500 characters or fewer. They are " + value.length + " now.";
      return "";
    }
    return "";
  }

  function renderDetailsStep(body) {
    var form = el("form", { class: "flow-form details", novalidate: true });

    FIELDS.forEach(function (f) {
      var id = "field-" + f.name;
      var hintId = f.hint ? id + "-hint" : null;
      var errId = id + "-error";
      var err = state.errors[f.name];
      var describedBy = [hintId, err ? errId : null].filter(Boolean).join(" ") || null;
      var attrs = {
        id: id, name: f.name, class: "input" + (f.multiline ? " input--area" : ""),
        autocomplete: f.autocomplete || "off",
        inputmode: f.inputmode || null,
        "aria-describedby": describedBy,
        "aria-invalid": err ? "true" : null,
        "aria-required": f.required ? "true" : null
      };
      var control;
      if (f.multiline) {
        attrs.rows = "4";
        control = el("textarea", attrs);
      } else {
        attrs.type = f.type;
        if (f.name === "name") attrs.autocapitalize = "words";
        if (f.type === "email") { attrs.autocapitalize = "off"; attrs.spellcheck = "false"; }
        control = el("input", attrs);
      }
      control.value = state.details[f.name] || "";

      control.addEventListener("input", function () {
        state.details[f.name] = control.value;
        // Clear an error as soon as it's fixed; don't add new ones while typing.
        if (state.errors[f.name] && !validate(f.name, control.value)) setFieldError(form, f, "");
      });
      control.addEventListener("blur", function () {
        if (control.value.trim() || state.errors[f.name]) setFieldError(form, f, validate(f.name, control.value));
      });

      form.appendChild(el("div", { class: "field" + (f.multiline ? " field--wide" : "") },
        el("label", { for: id, class: "field__label" }, f.label, f.optional ? el("span", { class: "field__optional", text: " (optional)" }) : null),
        f.hint ? el("p", { class: "field__hint", id: hintId, text: f.hint }) : null,
        control,
        el("p", { class: "field-error", id: errId, hidden: !err, text: err || "" })
      ));
    });

    form.appendChild(el("div", { class: "flow-actions field--wide" },
      el("button", { type: "submit", class: "button button--primary", text: "Review appointment" })));

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var firstBad = null, count = 0;
      FIELDS.forEach(function (f) {
        var control = form.elements[f.name];
        state.details[f.name] = control.value;
        var message = validate(f.name, control.value);
        setFieldError(form, f, message);
        if (message) { count++; if (!firstBad) firstBad = { control: control, message: message }; }
      });
      if (firstBad) {
        focusNode(firstBad.control);
        announce((count === 1 ? "One field needs a change. " : count + " fields need a change. ") + firstBad.message, true);
        return;
      }
      state.details = {
        name: state.details.name.trim(), phone: state.details.phone.trim(),
        email: state.details.email.trim(), notes: state.details.notes.trim()
      };
      goTo(4);
    });

    body.appendChild(form);
  }

  function setFieldError(form, f, message) {
    state.errors[f.name] = message;
    var id = "field-" + f.name;
    var control = form.querySelector("#" + id);
    var errNode = form.querySelector("#" + id + "-error");
    if (!control || !errNode) return;
    errNode.textContent = message;
    errNode.hidden = !message;
    var ids = [f.hint ? id + "-hint" : null, message ? id + "-error" : null].filter(Boolean);
    if (ids.length) control.setAttribute("aria-describedby", ids.join(" "));
    else control.removeAttribute("aria-describedby");
    if (message) control.setAttribute("aria-invalid", "true");
    else control.removeAttribute("aria-invalid");
  }

  /* ---------- Step 4: review and confirm ---------- */

  function summaryList(data) {
    var dl = el("dl", { class: "summary" });
    data.forEach(function (row) {
      if (!has(row[1])) return;
      dl.appendChild(el("div", { class: "summary__row" },
        el("dt", { text: row[0] }), el("dd", { text: row[1] })));
    });
    return dl;
  }

  function appointmentRows(b) {
    return [
      ["Service", b.serviceName],
      ["Date", UI.formatDate(b.date)],
      ["Time", UI.formatTime(b.startMinutes) + " to " + UI.formatTime(b.startMinutes + b.durationMinutes) + " " + SITE.timeZoneLabel],
      ["Length", UI.formatDuration(b.durationMinutes)],
      ["Price", b.priceLabel],
      ["Where", UI.locationLine()],
      ["Name", b.client.name],
      ["Mobile", b.client.phone],
      ["Email", b.client.email],
      ["Notes", b.client.notes]
    ];
  }

  function draftBooking() {
    var s = service();
    return {
      serviceId: s.id,
      serviceName: s.name,
      durationMinutes: s.minutes,
      priceLabel: UI.formatPrice(s),
      date: state.date,
      startMinutes: state.start,
      client: {
        name: state.details.name, phone: state.details.phone,
        email: state.details.email, notes: state.details.notes
      }
    };
  }

  function renderReviewStep(body) {
    body.appendChild(summaryList(appointmentRows(draftBooking())));
    if (has(SITE.cancellationPolicy)) body.appendChild(el("p", { class: "flow-policy", text: SITE.cancellationPolicy }));
    var button = el("button", { type: "button", class: "button button--primary", text: "Confirm appointment", onclick: confirmBooking });
    body.appendChild(el("div", { class: "flow-actions" }, button));
  }

  function confirmBooking(e) {
    if (state.busy) return;
    var button = e.currentTarget;
    state.busy = true;
    button.setAttribute("aria-disabled", "true");
    button.setAttribute("aria-busy", "true");

    var s = service();
    refreshBookings().then(function (bookings) {
      var now = UI.now();
      var query = { date: state.date, start: state.start, duration: s.minutes, now: now };
      if (S.isSlotOpen(SITE, Object.assign({ bookings: bookings }, query))) {
        return store.createBooking(draftBooking()).then(function (saved) {
          state.bookings.push(saved);
          state.confirmed = saved;
          render();
          renderNextOpen();
          var heading = doneNode.querySelector(".done__title");
          focusNode(heading);
          revealNode(heading);
          announce("Appointment confirmed: " + saved.serviceName + ", " + whenText(saved.date, saved.startMinutes) + " " + SITE.timeZoneLabel + ".");
        });
      }
      // Slot no longer open: say why, then go back to step 2.
      var takenByBooking = S.isSlotOpen(SITE, Object.assign({ bookings: [] }, query));
      var when = whenText(state.date, state.start);
      state.notice = takenByBooking
        ? "The " + UI.formatTime(state.start) + " time on " + UI.formatDate(state.date) + " was just booked by someone else. Choose another time below."
        : when + " is now too close to book (" + SITE.booking.minNoticeHours + " hours' notice is needed). Choose another time below.";
      state.start = null;
      goTo(2, { keepNotice: true, assertive: true, message: state.notice });
      renderNextOpen();
    }).catch(function () {
      announce("The appointment couldn't be saved in this browser. Check that site storage is allowed, then select Confirm appointment again.", true);
    }).then(function () {
      state.busy = false;
      if (button.isConnected) { button.removeAttribute("aria-disabled"); button.removeAttribute("aria-busy"); }
    });
  }

  /* ---------- Confirmation ---------- */

  function renderDone() {
    var b = state.confirmed;
    clear(doneNode);
    doneNode.appendChild(el("h3", { class: "done__title", tabindex: "-1", text: "Appointment confirmed" }));
    doneNode.appendChild(el("p", { class: "done__lede", text: b.serviceName + ", " + whenText(b.date, b.startMinutes) + " " + SITE.timeZoneLabel + "." }));
    doneNode.appendChild(summaryList(appointmentRows(b)));
    if (has(SITE.cancellationPolicy)) doneNode.appendChild(el("p", { class: "flow-policy", text: SITE.cancellationPolicy }));

    if (SITE.previewMode) {
      doneNode.appendChild(el("p", { class: "done__note",
        text: "Preview mode: this appointment is saved only in this browser. No email or text message has been sent, so add it to your calendar to keep a record." }));
    } else {
      doneNode.appendChild(el("p", { class: "done__note", text: "Add it to your calendar to keep a record." }));
    }

    doneNode.appendChild(el("div", { class: "flow-actions" },
      el("button", { type: "button", class: "button button--primary", text: "Add to calendar", onclick: function () { downloadICS(b); } }),
      el("button", { type: "button", class: "button button--quiet", text: "Book another appointment", onclick: startOver })
    ));
  }

  function downloadICS(b) {
    var details = [
      b.serviceName + ", " + UI.formatDuration(b.durationMinutes) + (b.priceLabel ? ", " + b.priceLabel : "") + ".",
      SITE.cancellationPolicy
    ];
    if (has(SITE.phone)) details.push("Phone: " + SITE.phone.trim());
    if (has(SITE.email)) details.push("Email: " + SITE.email.trim());
    var ics = S.buildICS({
      uid: b.id + "@marine-layer",
      date: b.date,
      startMinutes: b.startMinutes,
      durationMinutes: b.durationMinutes,
      summary: b.serviceName + ", " + SITE.businessName,
      location: UI.locationLine(),
      description: details.filter(has).join("\n")
    });
    var blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = el("a", { href: url, download: "appointment-" + b.date + ".ics" });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    announce("Calendar file downloaded. Open it to add the appointment to your calendar.");
  }

  function startOver() {
    var keep = state.details;
    state.confirmed = null;
    state.serviceId = null; state.date = null; state.start = null; state.view = null; state.focusDate = null;
    state.details = { name: keep.name, phone: keep.phone, email: keep.email, notes: "" };
    goTo(1);
  }

  /* ---------- Entry points (menu "Book", hero times) ---------- */

  function start(detail) {
    if (!detail || !UI.findService(detail.serviceId)) return;
    state.confirmed = null;
    state.serviceId = detail.serviceId;
    state.notice = "";
    state.view = null; state.focusDate = null;
    state.date = null; state.start = null;

    var s = service();
    var step = 2, message = s.name + " selected.";
    if (detail.date && detail.start != null &&
        S.isSlotOpen(SITE, { date: detail.date, start: detail.start, duration: s.minutes, bookings: state.bookings, now: UI.now() })) {
      state.date = detail.date;
      state.start = detail.start;
      step = 3;
      message = s.name + ", " + whenText(detail.date, detail.start) + " selected.";
    }
    goTo(step, { message: message, skipScroll: true });
    scrollToFlow();
  }

  document.addEventListener("booking:start", function (e) {
    refreshBookings().then(function () { start(e.detail); });
  });

  /* ---------- Next open appointments (hero) ---------- */

  function renderNextOpen() {
    var box = document.getElementById("next-days");
    if (!box) return;
    var s = UI.findService(SITE.booking.heroServiceId) || UI.services()[0];
    if (!s) {
      clear(box);
      box.appendChild(el("p", { class: "next__empty", text: "No services are open for booking yet." }));
      return;
    }
    var note = document.getElementById("next-note");
    if (note) note.textContent = s.name + ", " + UI.formatDuration(s.minutes) + ", " + UI.formatPrice(s) + ". Times in " + SITE.timeZoneLabel + ".";

    var days = S.nextOpenDays(SITE, { count: 3, duration: s.minutes, bookings: state.bookings, now: UI.now() });
    clear(box);
    if (!days.length) {
      box.appendChild(el("p", { class: "next__empty", text: "No open times for this service in the next " + SITE.booking.maxDaysAhead + " days." }));
      return;
    }
    var list = el("ul", { class: "next__days", role: "list" });
    days.forEach(function (d) {
      var times = S.spreadTimes(d.slots, 4, 60);
      var dayId = "next-" + d.date;
      var ul = el("ul", { class: "next__times", role: "list", "aria-labelledby": dayId });
      times.forEach(function (m) {
        ul.appendChild(el("li", null, el("button", {
          type: "button", class: "slot-button",
          "aria-label": "Book " + s.name.toLowerCase() + " on " + whenText(d.date, m),
          text: UI.formatTime(m),
          onclick: function () {
            document.dispatchEvent(new CustomEvent("booking:start", { detail: { serviceId: s.id, date: d.date, start: m } }));
          }
        })));
      });
      list.appendChild(el("li", { class: "next__day" },
        el("p", { class: "next__date", id: dayId, text: UI.formatDate(d.date) }), ul));
    });
    box.appendChild(list);
  }

  /* ---------- Start ---------- */

  if (store.onChange) {
    store.onChange(function () {
      refreshBookings().then(function () {
        renderNextOpen();
        if (state.step === 2 && !state.confirmed) {
          var active = document.activeElement;
          var selector = active && active.dataset && active.dataset.date ? '.day[data-date="' + active.dataset.date + '"]' : null;
          rerenderTimeStep(root.contains(active) ? selector : null);
        }
      });
    });
  }

  refreshBookings().then(function () {
    renderNextOpen();
    render();
  });
})();
