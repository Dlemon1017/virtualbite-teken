/*
 * Onboarding-planner (zelfde site als de partnerpagina, link #o={token}). De partner kiest een dag en begintijd voor de
 * sessie "Onboarding & training" op locatie (3 uur, ook de kennismaking met de trainer) uit de vrije tijd van de trainer.
 * Dagen en tijden als keuzeknoppen ("pillen") in de stijl van de partnerpagina. De server controleert alles opnieuw.
 */
window.VBPlanner = (function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var token = '';
  var g = null; // gegevens van plan_start
  var keuze = {}; // {datum, tijd}

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
  function pillen(wat, waarden, gekozen) {
    return '<div class="keuze pillen" role="group" data-wat="' + wat + '">' + waarden.map(function (w) {
      return '<button type="button" data-waarde="' + esc(w[0]) + '" aria-pressed="' + (w[0] === gekozen) + '">' + esc(w[1]) + '</button>';
    }).join('') + '</div>';
  }

  function gekozenDag() {
    return (g.mogelijkheden || []).filter(function (d) { return d.datum === keuze.datum; })[0];
  }

  function blokHtml() {
    var h = '<div class="label">Dag</div>' + pillen('datum', (g.mogelijkheden || []).map(function (d) { return [d.datum, d.label]; }), keuze.datum);
    var dag = gekozenDag();
    if (dag) h += '<div class="label">Begintijd</div>' + pillen('tijd', dag.tijden.map(function (t) { return [t, t]; }), keuze.tijd);
    return h;
  }

  function eindTijd(t) {
    var m = Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) + (g.duur || 180);
    return (m < 600 ? '0' : '') + Math.floor(m / 60) + ':' + (m % 60 < 10 ? '0' : '') + m % 60;
  }

  function teken() {
    $('blok-sessie').innerHTML = blokHtml();
    var dag = gekozenDag();
    var klaar = !!(dag && keuze.tijd);
    $('plan-overzicht').innerHTML = klaar ? '<h2>Je keuze</h2>' + lijstHtml(['Onboarding & training (op locatie) – ' + dag.label + ', ' +
      keuze.tijd + '–' + eindTijd(keuze.tijd)]) : '';
    $('plan-overzicht').hidden = !klaar;
    $('plan-bevestig').classList.toggle('klaar', klaar);
    if (klaar) $('plan-fout').hidden = true;
  }

  function toonPagina() {
    var merk = g.merk || {};
    var wie = g.trainer ? esc(g.trainer) + ', onze kitchen trainer,' : 'Onze kitchen trainer';
    zet('<div class="merk-blok">' + (merk.logo ? '<img src="merken/' + esc(merk.logo) + '" alt="' + esc(merk.naam) + '">' : '') +
      '<div><h1>Plan je onboarding en training</h1></div></div>' +
      '<p>Hoi ' + esc(g.voornaam || '') + ', ' + wie + ' komt bij je langs op ' + esc(g.adres) + '. In één bezoek van 3 uur doen ' +
      'we de onboarding (± 1 uur) en de training in je keuken (± 2 uur). Meteen een mooie kennismaking.</p>' +
      '<section class="kaart"><h2>Onboarding en training (op locatie, 3 uur)</h2><p class="klein">Kies een dag en een begintijd. ' +
      'We plannen overdag, zodat we klaar zijn ruim voordat je avondservice begint.</p><div id="blok-sessie"></div></section>' +
      '<p class="klein">Je kunt kiezen van ' + esc(g.vanaf) + ' tot en met ' + esc(g.tot) + '.</p>' +
      '<section class="kaart" id="plan-overzicht" hidden></section>' +
      '<div id="plan-fout" class="melding-blok mb-let" hidden></div>' +
      '<button type="button" class="knop hoofd mt" id="plan-bevestig">Bevestigen</button>' + contactHtml());
    teken();
  }

  function bevestig(knop) {
    if (!keuze.datum || !keuze.tijd) {
      var f = $('plan-fout');
      f.textContent = 'Kies een dag en een begintijd.';
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
      if (r.bezet) { keuze = {}; return laad(r.fout); } // tijd net bezet: opnieuw laden met de actuele vrije tijden
      var f = $('plan-fout');
      f.textContent = r.fout || 'Er ging iets mis.';
      f.hidden = false;
    }).catch(function (e) { knop.disabled = false; knop.textContent = oud; toonFout(e.message); });
  }

  function toonGepland(lijst, net, email) {
    if (net) {
      bericht('Gepland!', lijstHtml(lijst) + '<p>Je krijgt van Google Agenda een uitnodiging' + (email ? ' op ' + esc(email) : '') +
        '. Iets wijzigen? Neem contact op met Dimitri.</p>');
    } else {
      bericht('Je afspraak staat gepland', lijstHtml(lijst) + '<p>Iets wijzigen? Neem contact op met Dimitri.</p>');
    }
  }

  function toonFout(tekst) {
    var m = $('melding');
    m.textContent = tekst;
    m.className = 'toon fout';
    setTimeout(function () { m.className = ''; }, 6000);
  }

  /** Na opnieuw laden: alleen een keuze houden die nog vrij is. */
  function houdGeldigeKeuze() {
    var dag = gekozenDag();
    if (!dag) keuze = {};
    else if (keuze.tijd && dag.tijden.indexOf(keuze.tijd) === -1) keuze.tijd = '';
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
        var wat = b.closest('.pillen').getAttribute('data-wat');
        keuze[wat] = b.getAttribute('data-waarde');
        if (wat === 'datum') keuze.tijd = '';
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
