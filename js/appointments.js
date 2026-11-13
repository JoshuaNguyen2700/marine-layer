/*
  Owner page: lists bookings from window.BookingStore.
  Upcoming appointments grouped by day, past and cancelled ones folded below.
*/
(function () {
  "use strict";

  var SITE = window.SITE, S = window.Scheduling, store = window.BookingStore, UI = window.SiteUI;
  var el = UI.el, clear = UI.clear, has = UI.has;

  var upcomingBox = document.getElementById("upcoming");
  var pastBox = document.getElementById("past");
  var cancelledBox = document.getElementById("cancelled");
  var status = document.getElementById("owner-status");
  var confirmingId = null;

  function announce(message) {
    status.textContent = "";
    window.setTimeout(function () { status.textContent = message; }, 60);
  }

  function sortByTime(a, b) {
    return S.absMinutes(a.date, a.startMinutes) - S.absMinutes(b.date, b.startMinutes);
  }

  function timeRange(b) {
    return UI.formatTime(b.startMinutes) + " to " + UI.formatTime(b.startMinutes + b.durationMinutes);
  }

  function appointmentRow(b, kind) {
    var c = b.client || {};
    var row = el("article", { class: "appt" + (kind !== "upcoming" ? " is-" + kind : ""), "aria-label": timeRange(b) + ", " + b.serviceName + ", " + (c.name || "") });

    row.appendChild(el("p", { class: "appt__time" }, timeRange(b),
      el("span", { class: "appt__length", text: UI.formatDuration(b.durationMinutes) })));

    var info = el("div", { class: "appt__info" },
      el("p", { class: "appt__service", text: b.serviceName }),
      el("div", { class: "appt__client" },
        has(c.name) ? el("p", { text: c.name }) : null,
        has(c.phone) ? el("p", null, el("a", { href: UI.telHref(c.phone), text: c.phone })) : null,
        has(c.email) ? el("p", null, UI.mailHref(c.email)
          ? el("a", { href: UI.mailHref(c.email), text: c.email })
          : c.email) : null
      ),
      has(c.notes) ? el("p", { class: "appt__notes" }, el("span", { class: "sr-only", text: "Notes: " }), c.notes) : null
    );
    row.appendChild(info);

    if (kind === "upcoming") row.appendChild(actions(b));
    return row;
  }

  function actions(b) {
    var box = el("div", { class: "appt__actions" });
    if (confirmingId !== b.id) {
      box.appendChild(el("button", {
        type: "button", class: "button button--line", text: "Cancel appointment",
        "aria-label": "Cancel appointment: " + b.serviceName + " for " + (b.client && b.client.name) + ", " + UI.formatDate(b.date) + " at " + UI.formatTime(b.startMinutes),
        dataset: { cancel: b.id },
        onclick: function () {
          confirmingId = b.id;
          render().then(function () {
            var yes = document.querySelector('[data-confirm="' + b.id + '"]');
            if (yes) yes.focus();
          });
        }
      }));
      return box;
    }
    var promptId = "confirm-" + b.id;
    box.appendChild(el("div", { class: "appt__confirm", role: "group", "aria-labelledby": promptId },
      el("p", { id: promptId, text: "Cancel this appointment? " + UI.formatTime(b.startMinutes) + " on " + UI.formatDate(b.date) + " becomes open for booking again." }),
      el("div", { class: "appt__confirm-buttons" },
        el("button", {
          type: "button", class: "button button--line", text: "Yes, cancel appointment",
          dataset: { confirm: b.id },
          onclick: function () {
            store.cancelBooking(b.id).then(function () {
              confirmingId = null;
              return render();
            }).then(function () {
              var heading = document.getElementById("upcoming-title");
              if (heading) heading.focus();
              announce("Appointment cancelled. " + UI.formatTime(b.startMinutes) + " on " + UI.formatDate(b.date) + " is open for booking again.");
            });
          }
        }),
        el("button", {
          type: "button", class: "button button--line", text: "Keep appointment",
          onclick: function () {
            confirmingId = null;
            render().then(function () {
              var back = document.querySelector('[data-cancel="' + b.id + '"]');
              if (back) back.focus();
            });
          }
        })
      )
    ));
    return box;
  }

  function groupByDay(list) {
    var groups = [];
    list.forEach(function (b) {
      var last = groups[groups.length - 1];
      if (!last || last.date !== b.date) groups.push({ date: b.date, items: [b] });
      else last.items.push(b);
    });
    return groups;
  }

  function renderGroups(box, list, kind) {
    clear(box);
    groupByDay(list).forEach(function (g) {
      var section = el("section", { class: "owner-day", "aria-label": UI.formatDate(g.date) },
        el("h3", { class: "owner-day__title", text: UI.formatDate(g.date) }));
      g.items.forEach(function (b) { section.appendChild(appointmentRow(b, kind)); });
      box.appendChild(section);
    });
  }

  function render() {
    return store.listBookings().then(function (all) {
      var now = UI.now();
      var nowAbs = S.absMinutes(now.date, now.minutes);
      var upcoming = [], past = [], cancelled = [];
      all.slice().sort(sortByTime).forEach(function (b) {
        if (b.status === "cancelled") cancelled.push(b);
        else if (S.absMinutes(b.date, b.startMinutes + b.durationMinutes) > nowAbs) upcoming.push(b);
        else past.push(b);
      });

      if (upcoming.length) renderGroups(upcomingBox, upcoming, "upcoming");
      else {
        clear(upcomingBox);
        upcomingBox.appendChild(el("p", { class: "owner-empty", text: "No upcoming appointments yet." }));
      }

      past.reverse(); // most recent first
      document.getElementById("past-wrap").hidden = !past.length;
      document.getElementById("past-summary").textContent = "Past appointments (" + past.length + ")";
      renderGroups(pastBox, past, "past");

      cancelled.reverse();
      document.getElementById("cancelled-wrap").hidden = !cancelled.length;
      document.getElementById("cancelled-summary").textContent = "Cancelled appointments (" + cancelled.length + ")";
      renderGroups(cancelledBox, cancelled, "cancelled");
    });
  }

  if (store.onChange) store.onChange(function () { render(); });
  render();
})();
