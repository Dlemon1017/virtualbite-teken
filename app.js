/*
 * Partnerpagina Virtualbite (virtualbite-teken, later teken.virtualbite.nl). Fase 3: de partner vult zelf in.
 * Werkt met het token uit de persoonlijke link (#f=…), zonder inloggen. Startscherm "Dit heb je nodig", formulier in
 * stappen met automatisch opslaan (gedeeld/formulier.js, dezelfde regels als de server), overzicht, Versturen, klaar.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var token = (/[#&]f=([^&]+)/.exec(location.hash) || [])[1] || '';
  token = token ? decodeURIComponent(token) : '';
  var partner = null;
  var inst = {};
  var merk = { naam: '', logo: '' };
  var contact = {};
  var stap = 0;

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var meldingTimer;
  function toon(tekst, isFout) {
    var m = $('melding');
    m.textContent = tekst;
    m.className = 'toon' + (isFout ? ' fout' : '');
    clearTimeout(meldingTimer);
    meldingTimer = setTimeout(function () { m.className = ''; }, isFout ? 6000 : 3200);
  }

  function bezig(knop, tekst) {
    var oud = knop.innerHTML;
    knop.disabled = true;
    knop.classList.add('bezig');
    knop.textContent = tekst || 'Bezig…';
    return function () { knop.disabled = false; knop.classList.remove('bezig'); knop.innerHTML = oud; };
  }

  // ---------- API (zonder cookies; Google laat een verzoek soms hangen of geeft een foutpagina) ----------
  var STORING = 'De server reageert even niet. Probeer het zo opnieuw.';
  var MAX_WACHT_MS = 20000;

  function post(verzoek) {
    var afbreken = typeof AbortController === 'function' ? new AbortController() : null;
    var t = afbreken ? setTimeout(function () { afbreken.abort(); }, MAX_WACHT_MS) : null;
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
      if (!j || j.status === 'get') throw new Error(STORING); // POST als GET doorgestuurd: niets gedaan
      return j;
    }, function (e) { clearTimeout(t); throw e; });
  }

  /** Aanroep met het token. Veilig te herhalen aanroepen krijgen bij een storing één nieuwe poging. */
  function api(actie, extra, herhaalbaar) {
    var verzoek = Object.assign({ actie: actie, token: token }, extra || {});
    var p = post(verzoek);
    if (herhaalbaar) p = p.catch(function (e) { if (e.message === STORING) return post(verzoek); throw e; });
    return p.then(function (j) {
      if (j.status === 'fout') throw new Error(j.melding || 'Er ging iets mis.');
      return j.data !== undefined ? j.data : j;
    });
  }

  var f = VBFormulier({
    root: $('inhoud'),
    inst: function () { return inst; },
    api: {
      bewaar: function (veld, waarde, volgnr) { return api('formulier_bewaar', { veld: veld, waarde: waarde, volgnr: volgnr }, true); },
      afstanden: function (regels) { return api('formulier_afstanden', { regels: regels }, true); },
      btw: function () { return api('formulier_btw', {}, true); }
    },
    naWijziging: function () { werkVersturenBij(); },
    melding: toon
  });

  function werkVersturenBij() {
    var knop = document.querySelector('[data-actie="versturen"]');
    if (knop) knop.classList.toggle('klaar', f.klaarVoorIngevuld());
  }

  function contactHtml() {
    var delen = [];
    if (contact.telefoon) delen.push('<a href="tel:' + esc(contact.telefoon.replace(/\s/g, '')) + '">' + esc(contact.telefoon) + '</a>');
    if (contact.email) delen.push('<a href="mailto:' + esc(contact.email) + '">' + esc(contact.email) + '</a>');
    return delen.length ? '<p class="contact">Vragen? ' + esc(contact.naam || 'Virtualbite') + ': ' + delen.join(' · ') + '</p>' : '';
  }

  function zet(html) {
    $('inhoud').innerHTML = html;
    window.scrollTo(0, 0);
  }

  // ---------- Schermen ----------
  function toonBericht(titel, tekst) {
    zet('<div class="afronden"><h1>' + esc(titel) + '</h1><p>' + esc(tekst) + '</p></div>' + contactHtml());
  }

  function merkHtml() {
    return '<div class="merk-blok">' + (merk.logo ? '<img src="merken/' + esc(merk.logo) + '" alt="' + esc(merk.naam) + '">' : '') +
      '<div><p class="merk">Je start met</p><h1>' + esc(merk.naam) + '</h1></div></div>';
  }

  var NODIG = [
    'KvK-nummer en BTW-nummer',
    'BSN (alleen bij een eenmanszaak)',
    'officiële bedrijfsnaam en vestigingsadres',
    'e-mailadres voor facturen en voor communicatie',
    'telefoonnummers (zaak en mobiel contactpersoon)',
    'bezorg- en afhaaltijden per dag',
    'hoe de zaak bestellingen ontvangt (koppeling: T-Connect, terminal, POS-API of anders)',
    'gewenst bezorggebied (postcodes)'
  ];

  function toonStart() {
    zet(merkHtml() +
      '<section class="kaart"><h2>Dit heb je nodig</h2>' +
      '<p>Hoi ' + esc(partner.voornaam_contact || '') + ', fijn dat je er bent! Leg dit even klaar of zoek het op:</p>' +
      '<ul class="checklist">' + NODIG.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>' +
      '<p class="klein mt">Invullen duurt ongeveer 10 tot 15 minuten. Je kunt tussendoor stoppen: alles wordt automatisch ' +
      'bewaard en je gaat later verder waar je was, ook op een ander apparaat.</p>' +
      '<button class="knop hoofd klaar mt" data-actie="starten">Starten</button></section>' + contactHtml());
  }

  function eersteOnvolledigeStap() {
    var g = Object.assign({}, partner);
    if (partner.heeft_bsn) g.bsn = '111222333';
    var fouten = valideerPartnerFormulier(g).fouten;
    for (var i = 0; i < FORMULIER_STAPPEN.length; i++) {
      if (FORMULIER_STAPPEN[i].velden.some(function (d) { return fouten[d.veld]; })) return i;
    }
    return -1;
  }

  function toonStap(n) {
    stap = n;
    var st = FORMULIER_STAPPEN[n];
    var laatste = n === FORMULIER_STAPPEN.length - 1;
    zet('<div class="voortgang"><div class="klein">Stap ' + (n + 1) + ' van ' + FORMULIER_STAPPEN.length + '</div>' +
      '<div class="balkje"><span></span></div></div>' +
      '<section class="kaart"><h2>' + esc(st.titel) + '</h2>' + f.stapVelden(st, partner, false) +
      (st.titel === 'Bezorggebied' ? '<div class="klein" id="afstandInfo" hidden></div>' : '') + '</section>' +
      '<div class="nav-knoppen">' + (n > 0 ? '<button class="knop licht" data-actie="vorige">Vorige</button>' : '') +
      '<button class="knop' + (n > 0 ? '' : ' alleen') + '" data-actie="volgende">' + (laatste ? 'Naar overzicht' : 'Volgende') +
      '</button></div>' + contactHtml());
    zetVoortgang((n + 1) / (FORMULIER_STAPPEN.length + 1));
    f.naTekenen();
    if (st.titel === 'Bezorggebied' && String(partner.postcodes_gewenst || '').trim() && !(partner.markering || {}).actueel) {
      f.planAfstanden(true);
    }
  }

  function toonOverzicht() {
    stap = -1;
    zet('<div class="voortgang"><div class="klein">Laatste stap: controleren en versturen</div>' +
      '<div class="balkje"><span></span></div></div>' +
      '<h1>Overzicht</h1><p class="sub">Klopt alles? Dan kun je je gegevens versturen.</p>' +
      FORMULIER_STAPPEN.map(function (st, i) {
        return '<section class="kaart"><div class="kaart-kop"><h2>' + esc(st.titel) + '</h2>' +
          '<button type="button" class="tekst-knop" data-actie="naar-stap" data-stap="' + i + '">Wijzig</button></div>' +
          VBSamenvatting(st, partner) + '</section>';
      }).join('') +
      '<div class="acties"><button class="knop hoofd" data-actie="versturen">Versturen</button></div>' + contactHtml());
    zetVoortgang(1);
    werkVersturenBij();
  }

  /** Breedte via JavaScript: de CSP van de pagina staat geen style-attributen in de HTML toe. */
  function zetVoortgang(deel) {
    var balk = document.querySelector('.voortgang .balkje span');
    if (balk) balk.style.width = Math.round(deel * 100) + '%';
  }

  function toonKlaar() {
    toonBericht('Bedankt!', 'Je gegevens zijn compleet. Virtualbite controleert alles en je ontvangt de overeenkomst per mail.');
  }

  // ---------- Acties ----------
  $('inhoud').addEventListener('click', function (e) {
    var knop = e.target.closest('[data-actie]');
    if (!knop) return;
    var actie = knop.getAttribute('data-actie');
    if (actie === 'starten') toonStap(0);
    else if (actie === 'vorige') { f.slaWachtendOp(); toonStap(stap - 1); }
    else if (actie === 'volgende') {
      f.slaWachtendOp();
      var fouten = f.controleerStap(FORMULIER_STAPPEN[stap]); // pas verder als deze stap klopt
      if (Object.keys(fouten).length) {
        f.toonVeldFouten(fouten);
        toon(f.samenvattingFouten(fouten), true);
        return;
      }
      if (stap === FORMULIER_STAPPEN.length - 1) toonOverzicht(); else toonStap(stap + 1);
    } else if (actie === 'naar-stap') toonStap(Number(knop.getAttribute('data-stap')));
    else if (actie === 'versturen') versturen(knop);
  });

  /** Versturen: eerst alles opslaan, dan de controle op de server. Bij problemen: naar de eerste stap met een probleem. */
  function versturen(knop) {
    var herstel = bezig(knop, 'Versturen…');
    f.slaWachtendOp().then(function () { return api('formulier_verstuur', {}); }).then(function (r) {
      herstel();
      if (r.fouten) {
        var i = FORMULIER_STAPPEN.map(function (st) { return st.velden.some(function (d) { return r.fouten[d.veld]; }); }).indexOf(true);
        toonStap(i === -1 ? 0 : i);
        f.toonVeldFouten(r.fouten);
        toon(f.samenvattingFouten(r.fouten), true);
        return;
      }
      toonKlaar();
    }).catch(function (err) { herstel(); toon(err.message, true); });
  }

  // ---------- Start ----------
  function start() {
    if (!token) {
      toonBericht('Deze link werkt niet', 'Open de link uit de mail of het WhatsApp-bericht van Virtualbite.');
      return;
    }
    api('formulier_start', {}, true).then(function (r) {
      merk = r.merk || merk;
      contact = r.contact || {};
      if (r.status === 'ongeldig') {
        toonBericht('Deze link werkt niet (meer)', 'Controleer of je de hele link hebt gebruikt, of vraag Virtualbite om een nieuwe link.');
        return;
      }
      if (r.status === 'verlopen') {
        toonBericht('Deze link is verlopen', 'Vraag Virtualbite om een nieuwe link. Wat je al had ingevuld, blijft bewaard.');
        return;
      }
      if (r.status === 'verstuurd') {
        toonBericht('Je gegevens zijn verstuurd', 'Virtualbite controleert alles en je ontvangt de overeenkomst per mail.');
        return;
      }
      partner = r.partner;
      partner.voornaam_contact = r.voornaam;
      inst = r.inst || {};
      f.huidig = partner;
      if (!r.begonnen) { toonStart(); return; }
      var i = eersteOnvolledigeStap();
      if (i === -1) toonOverzicht(); else toonStap(i);
      toon('Welkom terug, je gaat verder waar je gebleven was.');
    }).catch(function (err) {
      toonBericht('Even geduld', err.message || STORING);
    });
  }

  start();
})();
