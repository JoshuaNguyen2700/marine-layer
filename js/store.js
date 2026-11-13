/*
  Booking storage.

  The rest of the site only ever talks to window.BookingStore, which has
  three async methods:

    listBookings()          -> Promise<Booking[]>  (all bookings, any status)
    createBooking(booking)  -> Promise<Booking>    (returns the saved booking with its id)
    cancelBooking(id)       -> Promise<Booking>    (marks it cancelled; keeps the record)

  and one optional helper:

    onChange(callback)      -> call callback() when bookings change elsewhere
                               (another tab, or a real backend pushing updates)

  A Booking looks like:
    {
      id: "b_...",
      serviceId: "haircut-style",
      serviceName: "Haircut and style",
      durationMinutes: 60,
      priceLabel: "$95",
      date: "2026-11-17",          // business wall-clock date
      startMinutes: 600,           // minutes after midnight, business time
      client: { name, phone, email, notes },
      status: "confirmed" | "cancelled",
      createdAt: "2026-11-12T18:04:00.000Z",
      cancelledAt: "..."           // only when cancelled
    }

  Right now bookings are kept in this browser's localStorage (preview mode).
  To go live, write another object with the same methods that talks to a
  real backend (Firebase, Supabase, your own API...), and assign it to
  window.BookingStore below instead. Nothing else needs to change.
  A real backend must also refuse a booking that overlaps an existing one,
  because two different people's browsers can't see each other's storage.
*/
(function () {
  "use strict";

  var STORAGE_KEY = "marine-layer.bookings.v1";

  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return "b_" + window.crypto.randomUUID();
    }
    return "b_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function copy(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createLocalStorageStore(key) {
    var memory = []; // used only if localStorage is blocked (some private windows)
    var available = (function () {
      try {
        var probe = key + ".probe";
        window.localStorage.setItem(probe, "1");
        window.localStorage.removeItem(probe);
        return true;
      } catch (e) {
        return false;
      }
    })();

    function readAll() {
      if (!available) return copy(memory);
      try {
        var raw = window.localStorage.getItem(key);
        var list = raw ? JSON.parse(raw) : [];
        return Array.isArray(list) ? list : [];
      } catch (e) {
        return [];
      }
    }

    function writeAll(list) {
      if (!available) { memory = copy(list); return; }
      window.localStorage.setItem(key, JSON.stringify(list));
    }

    return {
      kind: "localStorage",
      persistent: available,

      listBookings: function () {
        return Promise.resolve(readAll());
      },

      createBooking: function (booking) {
        return new Promise(function (resolve) {
          var list = readAll();
          var saved = copy(booking);
          saved.id = makeId();
          saved.status = "confirmed";
          saved.createdAt = new Date().toISOString();
          list.push(saved);
          writeAll(list);
          resolve(copy(saved));
        });
      },

      cancelBooking: function (id) {
        return new Promise(function (resolve, reject) {
          var list = readAll();
          var found = null;
          list.forEach(function (b) {
            if (b.id === id) {
              b.status = "cancelled";
              b.cancelledAt = new Date().toISOString();
              found = b;
            }
          });
          if (!found) { reject(new Error("No booking with id " + id)); return; }
          writeAll(list);
          resolve(copy(found));
        });
      },

      onChange: function (callback) {
        window.addEventListener("storage", function (event) {
          if (event.key === key || event.key === null) callback();
        });
      }
    };
  }

  window.BookingStore = createLocalStorageStore(STORAGE_KEY);
})();
