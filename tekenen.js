/*
 * Tekenpagina (fase 4c), zelfde site als de partnerpagina, link #t={token}. Eén doorlopende pagina: overeenkomst
 * (leesversie), "Zo werkt het", Algemene Partnervoorwaarden (PDF), daaronder tekenen: naam en functie (vooraf ingevuld),
 * drie vinkjes, handtekening met vinger of muis. Na tekenen het bedankscherm; de rest gaat automatisch (fase 4d).
 */
window.VBTekenen = (function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var token = '';
  var gegevens = null;
  var pdfs = {}; // welk → Promise<{naam, blob}>
  var ip = '';
  var vinkTijd = {};
  var pad = null;

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------- API (zelfde aanpak als de partnerpagina: max. 20 s, veilige aanroepen één keer opnieuw) ----------
  var STORING = 'De server reageert even niet. Probeer het zo opnieuw.';
  function post(verzoek) {
    var afbreken = typeof AbortController === 'function' ? new AbortController() : null;
    var t = afbreken ? setTimeout(function () { afbreken.abort(); }, 20000) : null;
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
    var c = (gegevens && gegevens.contact) || {};
    var delen = [];
    if (c.telefoon) delen.push('<a href="tel:' + esc(c.telefoon.replace(/\s/g, '')) + '">' + esc(c.telefoon) + '</a>');
    if (c.email) delen.push('<a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>');
    return delen.length ? '<p class="contact">Vragen? ' + esc(c.naam || 'Virtualbite') + ': ' + delen.join(' · ') + '</p>' : '';
  }

  function bericht(titel, tekst) {
    zet('<div class="afronden"><h1>' + esc(titel) + '</h1><p>' + esc(tekst) + '</p></div>' + contactHtml());
  }

  // ---------- Handtekening (vinger, muis of pen) ----------
  function Handtekening(canvas) {
    var ctx = null;
    var vorige = null;
    var lengte = 0;
    function maat() {
      var r = canvas.getBoundingClientRect();
      var dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#1c2d82';
      lengte = 0;
    }
    function punt(e) {
      var r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    canvas.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
      vorige = punt(e);
      ctx.beginPath();
      ctx.arc(vorige.x, vorige.y, 1.2, 0, Math.PI * 2);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!vorige) return;
      e.preventDefault();
      var nu = punt(e);
      ctx.beginPath();
      ctx.moveTo(vorige.x, vorige.y);
      ctx.lineTo(nu.x, nu.y);
      ctx.stroke();
      lengte += Math.hypot(nu.x - vorige.x, nu.y - vorige.y);
      vorige = nu;
      if (pad && pad.naWijziging) pad.naWijziging();
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (t) {
      canvas.addEventListener(t, function () { vorige = null; if (pad && pad.naWijziging) pad.naWijziging(); });
    });
    maat();
    return {
      leeg: function () { return lengte < 25; }, // een stip of streepje is geen handtekening
      wis: maat,
      png: function () { // bijgesneden tot de getekende lijnen (+ marge), zodat hij op de lijn in de PDF goed groot staat
        var w = canvas.width, h = canvas.height;
        var data = ctx.getImageData(0, 0, w, h).data;
        var x0 = w, y0 = h, x1 = -1, y1 = -1;
        for (var y = 0; y < h; y += 2) {
          for (var x = 0; x < w; x += 2) {
            if (data[(y * w + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
          }
        }
        if (x1 < 0) return canvas.toDataURL('image/png');
        var m = Math.round(8 * (window.devicePixelRatio || 1));
        x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(w - 1, x1 + m); y1 = Math.min(h - 1, y1 + m);
        var uit = document.createElement('canvas');
        uit.width = x1 - x0 + 1; uit.height = y1 - y0 + 1;
        uit.getContext('2d').drawImage(canvas, x0, y0, uit.width, uit.height, 0, 0, uit.width, uit.height);
        return uit.toDataURL('image/png');
      }
    };
  }

  // ---------- PDF's (op de achtergrond ophalen; downloaden met een tik) ----------
  function haalPdf(welk) {
    if (!pdfs[welk]) {
      pdfs[welk] = api('teken_pdf', { welk: welk }, true).then(function (r) {
        var bin = atob(r.base64);
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return { naam: r.naam, blob: new Blob([bytes], { type: 'application/pdf' }) };
      });
      pdfs[welk].catch(function () { delete pdfs[welk]; });
    }
    return pdfs[welk];
  }

  function download(welk, knop) {
    var oud = knop.textContent;
    knop.textContent = 'Even geduld…';
    haalPdf(welk).then(function (b) {
      knop.textContent = oud;
      var url = URL.createObjectURL(b.blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = b.naam;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    }).catch(function (e) { knop.textContent = oud; toonFout(e.message); });
  }

  function toonFout(tekst) {
    var m = $('melding');
    m.textContent = tekst;
    m.className = 'toon fout';
    setTimeout(function () { m.className = ''; }, 6000);
  }

  // ---------- Schermen ----------
  function toonPagina() {
    var g = gegevens;
    var merk = g.merk || {};
    var vinkjes = [
      ['overeenkomst', 'Ik heb de partnerovereenkomst gelezen en ga ermee akkoord.'],
      ['av_zwh', 'Ik heb de Algemene Partnervoorwaarden en "Zo werkt het" ontvangen.']
    ];
    if (g.tb) vinkjes.push(['tb', 'Ik onderteken ook het registratieformulier van Thuisbezorgd.']);
    zet('<div class="merk-blok">' + (merk.logo ? '<img src="merken/' + esc(merk.logo) + '" alt="' + esc(merk.naam) + '">' : '') +
      '<div><h1>Je overeenkomst voor ' + esc(merk.naam || 'Virtualbite') + '</h1></div></div>' +
      '<p>Hoi ' + esc(g.voornaam || '') + ', je overeenkomst staat klaar. Lees hem rustig door; "Zo werkt het" zet de ' +
      'belangrijkste afspraken op een rij. Klopt alles? Dan teken je onderaan. Dat duurt een paar minuten.</p>' +
      '<button type="button" class="knop licht" data-actie="naar-tekenen">Naar tekenen</button>' +

      '<section class="kaart lees"><h2>1. Partnerovereenkomst</h2><div class="lees-doc">' + g.overeenkomst_html + '</div>' +
      '<button type="button" class="klein-knop mt" data-pdf="overeenkomst">Download als PDF</button></section>' +

      '<section class="kaart lees"><h2>2. Zo werkt het</h2><p class="sub">De belangrijkste afspraken in het kort.</p>' +
      '<div class="lees-doc">' + g.zwh_html + '</div><button type="button" class="klein-knop mt" data-pdf="zwh">Download als PDF</button></section>' +

      '<section class="kaart"><h2>Algemene Partnervoorwaarden</h2><p><a href="#" class="pdf-link" data-pdf="av">' +
      'Algemene Partnervoorwaarden (PDF)</a></p><p class="klein">Deze voorwaarden horen bij de overeenkomst. Je hebt ze ook ' +
      'per mail gekregen.</p></section>' +

      '<section class="kaart" id="tekenen"><h2>3. Tekenen</h2>' +
      '<label for="t-naam">Je naam</label><input id="t-naam" autocomplete="name" value="' + esc(g.naam) + '">' +
      '<label for="t-functie">Functie</label><input id="t-functie" autocomplete="organization-title" value="' + esc(g.functie) + '">' +
      vinkjes.map(function (v) {
        return '<label class="vink-regel"><input type="checkbox" data-vink="' + v[0] + '"> <span>' + esc(v[1]) +
          (v[0] === 'tb' ? ' <button type="button" class="info" data-uitlegtb aria-label="Uitleg bij het registratieformulier" ' +
            'aria-expanded="false">i</button>' : '') + '</span></label>' +
          (v[0] === 'tb' ? '<div class="klein uitleg-tb" id="uitlegTb" hidden>Daarmee melden wij je aan bij Thuisbezorgd. Het ' +
            'formulier is al ingevuld met je gegevens; jouw handtekening komt eronder.</div>' : '');
      }).join('') +
      '<div class="label">Handtekening</div><p class="klein">Zet hier je handtekening met je vinger (of muis).</p>' +
      '<canvas id="t-handtekening" class="handtekening-vak" aria-label="Handtekeningvak"></canvas>' +
      '<button type="button" class="klein-knop" data-actie="opnieuw">Opnieuw</button>' +
      '<div id="t-fouten" class="melding-blok mb-let" hidden></div>' +
      '<button type="button" class="knop hoofd mt" data-actie="tekenen">Tekenen</button>' +
      '<p class="klein">Met "Tekenen" onderteken je de overeenkomst digitaal. Als bewijs leggen we het tijdstip, je IP-adres ' +
      'en je apparaat vast.</p></section>' + contactHtml());
    // De titel en ondertitel van het document zelf staan al als kop van de kaart: weglaten.
    document.querySelectorAll('.lees-doc').forEach(function (doc) {
      while (doc.firstElementChild && doc.firstElementChild.classList.contains('lees-midden')) doc.firstElementChild.remove();
    });
    pad = Handtekening($('t-handtekening'));
    pad.naWijziging = werkKnopBij;
    werkKnopBij();
    ['overeenkomst', 'zwh', 'av'].forEach(haalPdf); // alvast ophalen: downloaden gaat dan direct
  }

  function ontbreekt() {
    var f = [];
    var alleVinkjes = Array.prototype.every.call(document.querySelectorAll('[data-vink]'), function (x) { return x.checked; });
    if (!alleVinkjes) f.push('Vink alle vakjes aan.');
    if (!$('t-naam').value.trim()) f.push('Vul je naam in.');
    if (!$('t-functie').value.trim()) f.push('Vul je functie in.');
    if (!pad || pad.leeg()) f.push('Zet je handtekening.');
    return f;
  }

  function werkKnopBij() {
    var knop = document.querySelector('[data-actie="tekenen"]');
    if (!knop) return;
    var f = ontbreekt();
    knop.classList.toggle('klaar', !f.length);
    var vak = $('t-fouten');
    if (vak && !vak.hidden) { // al zichtbaar: bijwerken (of weg als alles klopt)
      vak.innerHTML = f.map(esc).join('<br>');
      vak.hidden = !f.length;
    }
  }

  function tekenen(knop) {
    var f = ontbreekt();
    if (f.length) {
      var vak = $('t-fouten');
      vak.innerHTML = f.map(esc).join('<br>');
      vak.hidden = false;
      vak.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    var oud = knop.textContent;
    knop.disabled = true;
    knop.textContent = 'Bezig met tekenen…';
    var vinkjes = {};
    document.querySelectorAll('[data-vink]').forEach(function (x) { vinkjes[x.getAttribute('data-vink')] = vinkTijd[x.getAttribute('data-vink')]; });
    api('teken_teken', {
      naam: $('t-naam').value, functie: $('t-functie').value, vinkjes: vinkjes, handtekening: pad.png(),
      ip: ip, user_agent: navigator.userAgent
    }).then(function (r) {
      if (r.fouten) {
        knop.disabled = false; knop.textContent = oud;
        var vak = $('t-fouten');
        vak.innerHTML = r.fouten.map(esc).join('<br>');
        vak.hidden = false;
        return;
      }
      if (r.status === 'getekend') return toonBedankt();
      toonStatus(r.status);
    }).catch(function (e) {
      knop.disabled = false; knop.textContent = oud;
      toonFout(e.message);
    });
  }

  function nieuweLink(knop) {
    var oud = knop.textContent;
    knop.disabled = true;
    knop.textContent = 'Versturen…';
    api('teken_nieuwe_link', {}).then(function (r) {
      var uit = $('nieuweLinkUitslag');
      if (r.gestuurd) { knop.hidden = true; uit.textContent = 'Er is een nieuwe link gestuurd naar ' + r.email + '. Kijk in je mail (ook bij spam).'; }
      else {
        knop.disabled = false; knop.textContent = oud;
        uit.textContent = r.te_vaak ? 'Er is net al een nieuwe link gestuurd. Kijk in je mail, of probeer het over een uur opnieuw.' :
          'Deze link kan geen nieuwe link meer aanvragen. Neem contact op met Virtualbite.';
      }
      uit.hidden = false;
    }).catch(function (e) { knop.disabled = false; knop.textContent = oud; toonFout(e.message); });
  }

  function toonBedankt() {
    var g = gegevens || {};
    bericht('Bedankt, ' + (g.voornaam || '') + '!', 'Je overeenkomst is getekend. Binnen een paar minuten krijg je alles per ' +
      'mail: de getekende overeenkomst, "Zo werkt het", de Algemene Partnervoorwaarden' +
      (g.tb ? ' en het getekende registratieformulier van Thuisbezorgd. Wij melden je aan bij Thuisbezorgd en nemen' :
        '. Wij nemen') + ' contact met je op over de start.');
  }

  function toonStatus(status) {
    if (status === 'getekend') {
      bericht('Je hebt al getekend', (gegevens && gegevens.getekend_op ? 'Op ' + gegevens.getekend_op + '. ' : '') +
        'Alles is per mail naar je gestuurd.');
    } else if (status === 'verlopen') {
      zet('<div class="afronden"><h1>Deze link is verlopen</h1><p>Vraag hieronder een nieuwe link aan; je krijgt hem meteen ' +
        'per mail.</p><button class="knop hoofd klaar mt" data-actie="nieuwe-link">Stuur me een nieuwe link</button>' +
        '<p class="klein mt" id="nieuweLinkUitslag" hidden></p></div>' + contactHtml());
    } else {
      bericht('Deze link werkt niet meer', 'Waarschijnlijk is de overeenkomst aangepast; je krijgt een nieuwe link.');
    }
  }

  // ---------- Gebeurtenissen ----------
  function koppel() {
    var inhoud = $('inhoud');
    inhoud.addEventListener('click', function (e) {
      var pdfKnop = e.target.closest('[data-pdf]');
      if (pdfKnop) { e.preventDefault(); download(pdfKnop.getAttribute('data-pdf'), pdfKnop); return; }
      if (e.target.closest('[data-uitlegtb]')) {
        e.preventDefault(); // niet het vinkje omzetten
        var u = $('uitlegTb');
        u.hidden = !u.hidden;
        e.target.closest('[data-uitlegtb]').setAttribute('aria-expanded', String(!u.hidden));
        return;
      }
      var knop = e.target.closest('[data-actie]');
      if (!knop) return;
      var actie = knop.getAttribute('data-actie');
      if (actie === 'naar-tekenen') $('tekenen').scrollIntoView({ behavior: 'smooth', block: 'start' });
      else if (actie === 'opnieuw') { pad.wis(); werkKnopBij(); }
      else if (actie === 'tekenen') tekenen(knop);
      else if (actie === 'nieuwe-link') nieuweLink(knop);
    });
    inhoud.addEventListener('change', function (e) {
      var v = e.target.getAttribute && e.target.getAttribute('data-vink');
      if (v) vinkTijd[v] = e.target.checked ? new Date().toISOString() : '';
      werkKnopBij();
    });
    inhoud.addEventListener('input', werkKnopBij);
  }

  function haalIp() { // IP-adres zoals de browser het meldt (audit); lukt het niet, dan "niet beschikbaar"
    var afbreken = typeof AbortController === 'function' ? new AbortController() : null;
    if (afbreken) setTimeout(function () { afbreken.abort(); }, 4000);
    fetch('https://api.ipify.org?format=json', { credentials: 'omit', signal: afbreken ? afbreken.signal : undefined })
      .then(function (r) { return r.json(); }).then(function (j) { ip = String(j.ip || ''); }).catch(function () { ip = ''; });
  }

  function start(t) {
    token = t;
    koppel();
    if (!token) { gegevens = {}; toonStatus('ongeldig'); return; }
    haalIp();
    api('teken_start', {}, true).then(function (r) {
      gegevens = r;
      if (r.status === 'open') toonPagina(); else toonStatus(r.status);
    }).catch(function (e) { bericht('Even geduld', e.message || STORING); });
  }

  return { start: start };
})();
