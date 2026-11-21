/* ===== Page d'accueil (reprise de la maquette : bandeau marine, barre de recherche en pilule) ===== */
const IC={
  pin:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  cal:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  clock:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  hour:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9"/></svg>',
  people:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8.5" r="3.2"/><path d="M3 20c.4-3.6 3-5.5 6-5.5s5.6 1.9 6 5.5"/><path d="M16 5.6a3 3 0 0 1 0 5.8M18 14.8c1.7.6 2.8 2.2 3 4.7"/></svg>',
  search:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
  bell:'<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15z"/><path d="M10 21h4"/></svg>',
  help:'<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.2 1-1.2 1.8M12 17h.01"/></svg>',
  menu:'<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>'
};
function homeNav(){
  const links='<button data-a="go" data-r="search">Rechercher un espace</button><button data-a="go" data-r="propose">Publier un espace</button><button data-a="go" data-r="fav">Favoris</button><button data-a="resa">Réservations</button>';
  const badge=notifCount();
  return '<header class="hnav"><div class="hin"><button class="logo big" data-a="go" data-r="home" aria-label="MakomSpace, accueil">'+logo()+'<span>MAKOM<b>SPACE</b></span></button><nav class="hl" aria-label="Navigation principale">'+links+'</nav>'
   +'<div class="hr2"><button class="ic" data-a="notif" aria-label="Notifications">'+IC.bell+(badge?'<i class="dot">'+badge+'</i>':'')+'</button><button class="ic" data-a="go" data-r="faq" aria-label="Aide">'+IC.help+'</button><button class="btn" data-a="profil">Profil</button><button class="ic burger" data-a="menu" aria-label="Menu" aria-expanded="'+!!U.menuOpen+'">'+IC.menu+'</button></div></div>'
   +(U.menuOpen?'<nav class="mm" aria-label="Menu">'+links+'</nav>':'')+'</header>';
}
function notifCount(){
  if(S.role==='renter')return mine().filter(r=>['acceptée','confirmée'].includes(r.status)&&tsOf(r.date,r.end)>NOW()).length;
  if(S.role==='host')return hostRes().filter(r=>r.status==='demande').length;
  if(S.role==='admin')return S.verifs.filter(v=>v.status==='attente').length+S.disputes.filter(d=>d.status==='ouvert').length;
  return 0;
}
function heroArt(){
  return '<svg class="art" viewBox="0 0 1700 640" preserveAspectRatio="xMidYMid slice" aria-hidden="true">'
  +'<defs><linearGradient id="gw" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8a6f3a" stop-opacity=".55"/><stop offset="1" stop-color="#5c4a28" stop-opacity=".35"/></linearGradient><linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0A1B2E" stop-opacity=".1"/><stop offset=".55" stop-color="#0A1B2E" stop-opacity=".55"/><stop offset="1" stop-color="#0A1B2E" stop-opacity=".85"/></linearGradient></defs>'
  +'<rect x="40" y="-20" width="600" height="380" rx="22" fill="#0d2742" stroke="#08162a" stroke-width="10"/>'
  +'<g fill="#7d6531" opacity=".85"><rect x="90" y="262" width="52" height="60" rx="3"/><rect x="162" y="216" width="52" height="106" rx="3"/><rect x="234" y="168" width="52" height="154" rx="3"/><rect x="306" y="240" width="52" height="82" rx="3"/></g>'
  +'<g fill="#5b7088" opacity=".55"><rect x="386" y="130" width="120" height="14" rx="7"/><rect x="386" y="170" width="118" height="14" rx="7"/><rect x="386" y="208" width="136" height="14" rx="7"/></g>'
  +'<g stroke="#2a4260" stroke-width="3"><path d="M526 0v110M812 0v150M1097 0v128"/></g>'
  +'<g fill="#6b5628"><path d="M480 112h96l-14 40h-68z"/><path d="M766 152h92l-14 40h-64z"/><path d="M1050 130h96l-14 40h-68z"/></g>'
  +'<g fill="url(#gw)"><rect x="890" y="-10" width="240" height="250"/><rect x="1146" y="-10" width="240" height="250"/><rect x="1402" y="-10" width="320" height="250"/><rect x="890" y="256" width="240" height="250"/><rect x="1146" y="256" width="240" height="250"/><rect x="1402" y="256" width="320" height="250"/></g>'
  +'<g fill="#0a1b2e" opacity=".55"><rect x="1128" y="-10" width="18" height="520"/><rect x="1384" y="-10" width="18" height="520"/><rect x="890" y="240" width="832" height="16"/></g>'
  +'<g fill="#10294a" opacity=".8"><path d="M300 640l60-70h220l60 70z"/><path d="M820 640l50-60h180l50 60z"/><path d="M1280 640l60-70h230l60 70z"/></g>'
  +'<g fill="#0d2440" opacity=".9"><ellipse cx="1610" cy="560" rx="52" ry="78"/><ellipse cx="1560" cy="590" rx="40" ry="60"/></g>'
  +'<rect width="1700" height="640" fill="url(#shade)"/></svg>';
}
function heroBand(){
  const q=U.search,f=(ic,l,inner,cls)=>'<label class="hf '+(cls||'')+'"><span class="hic">'+ic+'</span><span class="hv"><span class="hl2">'+l+'</span>'+inner+'</span></label>';
  return '<section class="heroband" aria-label="Recherche">'+heroArt()+'<div class="hc"><h1>Recevez vos clients dans un vrai espace professionnel.</h1><p class="sub">Réservez un espace professionnel à l\'heure, à la demi-journée ou à la journée, sans abonnement.</p>'
   +'<form class="hs" onsubmit="return false" role="search">'
   +f(IC.pin,'Où ?','<input data-bind="search.city" value="'+esc(q.city)+'" placeholder="Ville (ex. Paris, Lyon…)" aria-label="Ville">','w2')
   +f(IC.cal,'Quand ?','<input type="date" data-bind="search.date" value="'+esc(q.date)+'" min="'+dkey(TODAY)+'" aria-label="Date">')
   +f(IC.clock,'De','<select data-bind="search.start" aria-label="Heure de début">'+timeOpts(q.start)+'</select>')
   +f(IC.hour,'Durée','<select data-bind="search.hours" aria-label="Durée">'+hourOpts(q.hours)+'</select>')
   +f(IC.people,'Capacité','<input type="number" min="1" data-bind="search.people" value="'+esc(q.people)+'" placeholder="Nb. personnes" aria-label="Nombre de personnes">')
   +'<button class="hbtn" type="button" data-a="search">'+IC.search+'<span>Rechercher</span></button></form></div></section>';
}
function homeRest(){
  const feat=S.spaces.filter(s=>s.status==='published').slice(0,6);
  return '<section class="col" style="text-align:center;align-items:center;gap:10px"><h2 class="big2">Un café n\'est pas un bureau.</h2><p class="muted" style="font-size:18px">L\'image de votre entreprise commence par l\'endroit où vous recevez vos partenaires.</p></section>'
  +'<section class="compare"><div class="card"><span class="tag bad">Bruyant et public</span><h3 style="margin-top:10px">Le café du coin</h3><ul class="ul"><li>Connexion wifi instable</li><li>Aucun respect de la confidentialité</li><li>Bruit de fond permanent</li></ul></div>'
  +'<div class="card" style="border-color:var(--gold)"><span class="tag gold">Précision MakomSpace</span><h3 style="margin-top:10px">Un espace MakomSpace</h3><ul class="ul"><li>Entreprises vérifiées avant publication</li><li>Équipements annoncés précisément, espace par espace</li><li>Un cadre professionnel, sans engagement, à l\'heure près</li></ul></div></section>'
  +'<section class="col"><h2>Choisissez votre usage</h2><div class="uses">'+Object.keys(TYPES).map(k=>'<button class="use" data-a="use" data-v="'+k+'"><b>'+TYPES[k]+'</b><span>'+TYPE_HINT[k]+'</span></button>').join('')+'</div></section>'
  +'<section class="col"><div class="row between"><div class="col" style="gap:4px"><h2>Espaces à la une</h2><p class="muted">Une sélection d\'espaces professionnels disponibles dès maintenant.</p></div><button class="btn ghost small" data-a="go" data-r="search">Tout voir</button></div><div class="grid g3">'+feat.map(s=>spCard(s)).join('')+'</div></section>'
  +'<section class="col"><h2>Comment ça marche ?</h2><div class="grid g2"><div class="card col"><span class="eyebrow">Pour les clients</span><div class="steps"><div class="st"><i>1</i><b>Recherchez</b><span class="muted small">Ville, date, heure de début, durée, personnes.</span></div><div class="st"><i>2</i><b>Réservez</b><span class="muted small">Choisissez votre créneau, signez le contrat, payez en ligne.</span></div><div class="st"><i>3</i><b>Travaillez</b><span class="muted small">Un code d\'accès valable sur votre créneau.</span></div></div></div>'
  +'<div class="card col"><span class="eyebrow">Pour les entreprises</span><div class="steps"><div class="st"><i>1</i><b>Listez</b><span class="muted small">Horaires, tarifs à l\'heure, règles, équipements.</span></div><div class="st"><i>2</i><b>Validation</b><span class="muted small">SIRET, assurance, conformité du local vérifiés.</span></div><div class="st"><i>3</i><b>Encaissez</b><span class="muted small">Reversement le lendemain, commission déduite.</span></div></div></div></div></section>'
  +'<section class="col"><h2>La garantie MakomSpace</h2><div class="grid g4">'
  +[['Paiement sécurisé','Prestataire certifié PCI-DSS. Débit seulement après acceptation.'],['Espaces vérifiés','SIRET, e-mail professionnel, adresse, attestation d\'assurance.'],['Contrat et caution','Contrat de mise à disposition signé en ligne, caution par pré-autorisation.'],['Réponse sous 24 h ouvrées','Question ou litige : une équipe vous répond.']].map(x=>'<div class="card flat"><h3>'+x[0]+'</h3><p class="muted small" style="margin-top:6px">'+x[1]+'</p></div>').join('')+'</div></section>';
}
function favView(){
  const l=(S.fav||[]).map(sp).filter(Boolean);
  return '<div class="col"><span class="eyebrow">Favoris</span><h1 style="font-size:clamp(28px,4vw,40px)">Vos espaces enregistrés</h1></div>'+(l.length?'<div class="grid g3">'+l.map(s=>spCard(s)).join('')+'</div>':'<div class="card"><b>Aucun favori pour le moment.</b><p class="muted small" style="margin-top:6px">Ouvrez la fiche d\'un espace et choisissez « Enregistrer ».</p><button class="btn small" style="margin-top:10px" data-a="go" data-r="search">Rechercher un espace</button></div>');
}
