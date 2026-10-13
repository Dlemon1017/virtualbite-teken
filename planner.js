/*
 * Onboarding-planner (zelfde site als de partnerpagina, link #o={token}). De partner kiest een onboarding (online via
 * Google Meet, 1 uur) en een training (op locatie, 3 uur, op een latere dag) uit de vrije tijd van Dimitri. Dagen en
 * tijden als keuzeknoppen ("pillen") in de stijl van de partnerpagina. De server controleert alles opnieuw.
 */
window.VBPlanner = (function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var token = '';
  var g = null; // gegevens van plan_start
  var keuze = { onboarding: {}, training: {} };

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------- API (zelfde aanpak als de partnerpagina) ----------
  var STORING = 'De server reageert even niet. Probeer het zo opnieuw.';
  function post(verzoek) {
    var afbreken = typeof AbortController === 'function' ? new AbortController() : null;
    var t = afbreken ? setTimeout(function () { afbreken.abort(); }, 25000) : null;
    return fetch(window.VB_CONFIG.api, {
      method: 'POST', credentials: 'omit', redirect: 'follow', signal: afbreken ? afbreken.signal : undefined,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(verzoek)
    }).then(function (r) {
      if (!r.ok) throw new Error(STORING);
      return r.text();
    }, function () { throw new Error(STORING); }).then(function (tekst) {
      clearTimeout(t);
      var j;
      try { j = JSON.parse(tekst); } catch (e) { throw new Error(STORING); }
      if (!j || j.status === 'get') throw new Error(STORING);
      return j;
    }, function (e) { clearTimeout(t); throw e; });
  }
  function api(actie, extra, herhaalbaar) {
    var verzoek = Object.assign({ actie: actie, token: token }, extra || {});
    var p = post(verzoek);
    if (herhaalbaar) p = p.catch(function (e) { if (e.message === STORING) return post(verzoek); throw e; });
    return p.then(function (j) {
      if (j.status === 'fout') throw new Error(j.melding || 'Er ging iets mis.');
      return j.data !== undefined ? j.data : j;
    });
  }

  function zet(html) {
    $('inhoud').innerHTML = html;
    window.scrollTo(0, 0);
  }

  function contactHtml() {
    var c = (g && g.contact) || {};
    var delen = [];
    if (c.telefoon) delen.push('<a href="tel:' + esc(c.telefoon.replace(/\s/g, '')) + '">' + esc(c.telefoon) + '</a>');
    if (c.email) delen.push('<a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>');
    return delen.length ? '<p class="contact">Vragen? ' + esc(c.naam || 'Virtualbite') + ': ' + delen.join(' · ') + '</p>' : '';
  }

  function bericht(titel, html) {
    zet('<div class="afronden"><h1>' + esc(titel) + '</h1>' + html + '</div>' + contactHtml());
  }

  function lijstHtml(regels) {
    return '<ul class="plan-lijst">' + (regels || []).map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul>';
  }

  // ---------- Kiezen ----------
  function dagenVan(soort) {
    var dagen = (g.mogelijkheden || {})[soort] || [];
    if (soort === 'training' && keuze.onboarding.datum) dagen = dagen.filter(function (d) { return d.datum > keuze.onboarding.datum; });
    return dagen;
  }

  function pillen(soort, wat, waarden, gekozen) {
    return '<div class="keuze pillen" role="group" data-soort="' + soort + '" data-wat="' + wat + '">' + waarden.map(function (w) {
      return '<button type="button" data-waarde="' + esc(w[0]) + '" aria-pressed="' + (w[0] === gekozen) + '">' + esc(w[1]) + '</button>';
    }).join('') + '</div>';
  }

  function blokHtml(soort) {
    var k = keuze[soort];
    var h = '';
    if (soort === 'training' && !keuze.onboarding.datum) return '<p class="klein">Kies eerst de onboarding.</p>';
    var dagen = dagenVan(soort);
    if (!dagen.length) return '<p class="klein">Na deze onboarding zijn er geen dagen meer vrij. Kies een eerdere onboarding.</p>';
    h += '<div class="label">Dag</div>' + pillen(soort, 'datum', dagen.map(function (d) { return [d.datum, d.label]; }), k.datum);
    var dag = dagen.filter(function (d) { return d.datum === k.datum; })[0];
    if (dag) h += '<div class="label">Begintijd</div>' + pillen(soort, 'tijd', dag.tijden.map(function (t) { return [t, t]; }), k.tijd);
    return h;
  }

  function overzicht() {
    var regel = function (soort, naam, duur) {
      var k = keuze[soort];
      if (!k.datum || !k.tijd) return '';
      var dag = ((g.mogelijkheden || {})[soort] || []).filter(function (d) { return d.datum === k.datum; })[0];
      var eind = (function () { var m = Number(k.tijd.slice(0, 2)) * 60 + Number(k.tijd.slice(3)) + duur; return (m < 600 ? '0' : '') + Math.floor(m / 60) + ':' + (m % 60 < 10 ? '0' : '') + m % 60; })();
      return naam + ' – ' + (dag ? dag.label : k.datum) + ', ' + k.tijd + '–' + eind;
    };
    return [regel('onboarding', 'Onboarding (online)', 60), regel('training', 'Training', 180)].filter(Boolean);
  }

  function teken() {
    $('blok-onboarding').innerHTML = blokHtml('onboarding');
    $('blok-training').innerHTML = blokHtml('training');
    var o = overzicht();
    $('plan-overzicht').innerHTML = o.length ? '<h2>Je keuze</h2>' + lijstHtml(o) : '';
    $('plan-overzicht').hidden = !o.length;
    var klaar = !!(keuze.onboarding.tijd && keuze.training.tijd);
    $('plan-bevestig').classList.toggle('klaar', klaar);
    if (klaar) $('plan-fout').hidden = true;
  }

  function toonPagina() {
    var merk = g.merk || {};
    zet('<div class="merk-blok">' + (merk.logo ? '<img src="merken/' + esc(merk.logo) + '" alt="' + esc(merk.naam) + '">' : '') +
      '<div><h1>Plan je onboarding en training</h1></div></div>' +
      '<p>Hoi ' + esc(g.voornaam || '') + ', de onboarding (1 uur) doen we online via Google Meet; je krijgt de link in de ' +
      'agenda-uitnodiging. De training (3 uur) is op je locatie: ' + esc(g.adres) + '.</p>' +
      '<section class="kaart"><h2>1. Onboarding (online, 1 uur)</h2><p class="klein">Kies een dag en een begintijd.</p>' +
      '<div id="blok-onboarding"></div></section>' +
      '<section class="kaart"><h2>2. Training (op locatie, 3 uur)</h2><p class="klein">Kies een dag na je onboarding en een ' +
      'begintijd.</p><div id="blok-training"></div></section>' +
      '<p class="klein">Je kunt kiezen van ' + esc(g.vanaf) + ' tot en met ' + esc(g.tot) + '.</p>' +
      '<section class="kaart" id="plan-overzicht" hidden></section>' +
      '<div id="plan-fout" class="melding-blok mb-let" hidden></div>' +
      '<button type="button" class="knop hoofd mt" id="plan-bevestig">Bevestigen</button>' + contactHtml());
    teken();
  }

  function bevestig(knop) {
    if (!(keuze.onboarding.tijd && keuze.training.tijd)) {
      var f = $('plan-fout');
      f.textContent = !keuze.onboarding.tijd ? 'Kies een dag en tijd voor de onboarding.' : 'Kies een dag en tijd voor de training.';
      f.hidden = false;
      f.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    var oud = knop.textContent;
    knop.disabled = true;
    knop.textContent = 'Bezig met plannen…';
    api('plan_bevestig', { keuze: keuze }).then(function (r) {
      if (r.status === 'gepland') return toonGepland(r.gepland, true, r.email);
      knop.disabled = false; knop.textContent = oud;
      if (r.bezet) { // tijd net bezet: opnieuw laden met de actuele vrije tijden
        keuze[r.bezet] = {};
        if (r.bezet === 'onboarding') keuze.training = {};
        return laad(r.fout);
      }
      var f = $('plan-fout');
      f.textContent = r.fout || 'Er ging iets mis.';
      f.hidden = false;
    }).catch(function (e) { knop.disabled = false; knop.textContent = oud; toonFout(e.message); });
  }

  function toonGepland(lijst, net, email) {
    if (net) {
      bericht('Gepland!', lijstHtml(lijst) + '<p>Je krijgt van Google Agenda voor beide afspraken een uitnodiging' +
        (email ? ' op ' + esc(email) : '') + '; bij de onboarding staat de Meet-link. Iets wijzigen? Neem contact op met Dimitri.</p>');
    } else {
      bericht('Je afspraken staan gepland', lijstHtml(lijst) + '<p>Iets wijzigen? Neem contact op met Dimitri.</p>');
    }
  }

  function toonFout(tekst) {
    var m = $('melding');
    m.textContent = tekst;
    m.className = 'toon fout';
    setTimeout(function () { m.className = ''; }, 6000);
  }

  /** Na opnieuw laden: alleen keuzes houden die nog vrij zijn. */
  function houdGeldigeKeuze() {
    ['onboarding', 'training'].forEach(function (soort) {
      var k = keuze[soort];
      var dag = (g.mogelijkheden[soort] || []).filter(function (d) { return d.datum === k.datum; })[0];
      if (!dag) keuze[soort] = {};
      else if (k.tijd && dag.tijden.indexOf(k.tijd) === -1) k.tijd = '';
    });
    if (keuze.training.datum && keuze.training.datum <= (keuze.onboarding.datum || '')) keuze.training = {};
  }

  function laad(melding) {
    return api('plan_start', {}, true).then(function (r) {
      g = r;
      if (r.status === 'open') {
        houdGeldigeKeuze();
        toonPagina();
        if (melding) { var f = $('plan-fout'); f.textContent = melding; f.hidden = false; f.scrollIntoView({ block: 'center' }); }
        return;
      }
      if (r.status === 'gepland') return toonGepland(r.gepland, false);
      if (r.status === 'geen_tijden' || r.status === 'verlopen') {
        return bericht('Er zijn geen tijden meer beschikbaar', '<p>Neem contact op met Dimitri, dan plannen we samen.</p>');
      }
      bericht('Deze link werkt niet meer', '<p>Neem contact op met Dimitri, dan plannen we samen.</p>');
    }).catch(function (e) { bericht('Even geduld', '<p>' + esc(e.message || STORING) + '</p>'); });
  }

  function start(t) {
    token = t;
    $('inhoud').addEventListener('click', function (e) {
      var b = e.target.closest('.pillen button');
      if (b) {
        var groep = b.closest('.pillen');
        var soort = groep.getAttribute('data-soort');
        var wat = groep.getAttribute('data-wat');
        keuze[soort][wat] = b.getAttribute('data-waarde');
        if (wat === 'datum') keuze[soort].tijd = '';
        if (soort === 'onboarding' && keuze.training.datum && keuze.training.datum <= keuze.onboarding.datum) keuze.training = {};
        teken();
        return;
      }
      if (e.target.closest('#plan-bevestig')) bevestig(e.target.closest('#plan-bevestig'));
    });
    if (!token) { g = {}; bericht('Deze link werkt niet meer', '<p>Neem contact op met Dimitri, dan plannen we samen.</p>'); return; }
    laad();
  }

  return { start: start };
})();
