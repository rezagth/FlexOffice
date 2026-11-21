/* ===== État d'interface ===== */
const U={route:'home',params:{},search:{city:'',date:'',start:'',hours:'',people:'',type:'',max:'',equip:[],sort:'rel'},sel:{date:'',start:null,end:null},
  co:{usage:'',people:1,company:'Studio Lumen',siret:'81234567800019',rc:false,rule:false,contract:false,name:'',msg:''},
  tab:'upcoming',hostTab:'today',adminTab:'overview',week:0,hostSpace:'bureau-flex-paris',block:false,modal:null,toast:'',draft:{},reveal:{},review:{stars:5,txt:''},tmp:{}};
const A={};

/* ===== Composants ===== */
function logo(){return '<svg width="30" height="26" viewBox="0 0 30 26" aria-hidden="true"><path d="M2 24V3l9 11 9-11v21" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><rect x="21" y="14" width="7" height="10" fill="var(--gold)"/></svg>'}
function plan(s){
  const f='var(--muted)',R=(x,y,w,h,o)=>'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="3" fill="'+f+'" opacity="'+(o||.18)+'"/>';
  let i='';
  if(s.type==='MEETING'||s.type==='TRAINING'){i=R(40,35,80,30,.3)+[0,1,2,3].map(k=>R(46+k*20,25,12,8)+R(46+k*20,67,12,8)).join('')+R(135,20,6,60,.25)}
  else if(s.type==='DESK'){i=R(30,30,60,26,.3)+R(55,62,18,14)+R(110,25,28,50,.2)}
  else if(s.type==='POPUP'){i=R(20,15,120,6,.4)+R(30,40,30,22,.25)+R(70,40,30,22,.25)+R(110,40,30,22,.25)+R(60,78,40,8,.3)}
  else if(s.type==='STUDIO'){i='<path d="M20 20 L140 20 L140 40 Q80 55 20 40Z" fill="'+f+'" opacity=".22"/>'+R(60,64,40,14,.3)+R(20,60,14,24,.2)+R(126,60,14,24,.2)}
  else{i=R(40,30,30,40,.28)+R(95,30,30,40,.28)+R(78,45,4,10)}
  return '<svg viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice" class="ph" role="img" aria-label="Plan schématique de '+esc(s.title)+'"><rect x="8" y="8" width="144" height="84" rx="8" fill="none" stroke="'+f+'" stroke-width="1.5" opacity=".5"/>'+i+'</svg>';
}
function stTag(st){const t={demande:['warn','En attente de l\'hôte'],acceptée:['ok','Acceptée'],confirmée:['ok','Confirmée'],terminée:['soft','Terminée'],annulée:['bad','Annulée'],refusée:['bad','Refusée']}[st]||['soft',st];return '<span class="tag '+t[0]+'">'+t[1]+'</span>'}
function stars(n){return '★'.repeat(Math.round(n))+'☆'.repeat(5-Math.round(n))}
function field(label,html){return '<label class="f">'+label+html+'</label>'}
function timeOpts(sel){let o='<option value="">Heure</option>';for(let t=480;t<=1200;t+=30)o+='<option value="'+t+'"'+(String(sel)===String(t)?' selected':'')+'>'+hm(t)+'</option>';return o}
function hourOpts(sel){return '<option value="">Durée</option>'+[1,2,3,4,6,8].map(h=>'<option value="'+h+'"'+(String(sel)===String(h)?' selected':'')+'>'+h+' h</option>').join('')}
function typeOpts(sel){return '<option value="">Tous les usages</option>'+Object.keys(TYPES).map(k=>'<option value="'+k+'"'+(sel===k?' selected':'')+'>'+TYPES[k]+'</option>').join('')}
function searchForm(q){
  return '<form class="search" data-a="search" onsubmit="return false">'
   +field('Où ?','<input data-bind="search.city" value="'+esc(q.city)+'" placeholder="Paris, Lyon, Strasbourg…" aria-label="Ville">')
   +field('Quand ?','<input type="date" data-bind="search.date" value="'+esc(q.date)+'" min="'+dkey(TODAY)+'">')
   +field('À partir de','<select data-bind="search.start">'+timeOpts(q.start)+'</select>')
   +field('Durée','<select data-bind="search.hours">'+hourOpts(q.hours)+'</select>')
   +field('Personnes','<input type="number" min="1" data-bind="search.people" value="'+esc(q.people)+'" placeholder="2">')
   +'<button class="btn" type="button" data-a="search">Rechercher</button></form>';
}
function spCard(s,note){
  const r=avgRating(s.id)||s.rating;
  return '<button class="sp" data-a="go" data-r="space" data-id="'+s.id+'">'+plan(s)
   +'<span class="in2"><span class="t">'+TYPES[s.type]+' · '+esc(s.zone)+'</span><span class="n">'+esc(s.title)+'</span>'
   +'<span class="muted small">'+esc(s.owner)+' · jusqu\'à '+s.cap+' pers. · '+s.surface+' m²</span>'
   +'<span class="row" style="gap:6px"><span class="tag">Entreprise vérifiée</span>'+(s.instant?'<span class="tag gold">Réservation immédiate</span>':'')+(r?'<span class="tag soft">'+r.toFixed(1)+' ★</span>':'')+'</span>'
   +(note?'<span class="small" style="color:var(--ok);font-weight:600">'+note+'</span>':'')
   +'<span class="price"><b class="tnum">'+eur(s.hourly)+'</b> / h <span class="muted small">· dès '+s.min+' h · '+eur(s.day)+' / jour</span></span></span></button>';
}
function msgThread(rid,me){
  const list=S.msgs[rid]||[];
  return '<div class="col"><div class="col" style="gap:8px">'+(list.length?list.map(x=>'<div class="msg'+(x.from===me?' me':'')+'">'+esc(x.text)+'<div class="muted small">'+(x.from==='host'?'Hôte':'Locataire')+' · '+new Date(x.ts).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+'</div></div>').join(''):'<p class="muted small">Aucun message pour le moment.</p>')+'</div>'
   +'<div class="row"><textarea class="in" style="flex:1;min-height:44px" data-bind="draft.'+rid+'" placeholder="Votre message">'+esc(U.draft[rid]||'')+'</textarea><button class="btn small" data-a="send" data-id="'+rid+'" data-me="'+me+'">Envoyer</button></div></div>';
}

/* ===== Gabarit ===== */
function demoBar(){
  const R=[['visitor','Visiteur'],['renter','Locataire'],['host','Bailleur'],['admin','Administrateur']];
  return '<div class="demo"><span><b>Prototype</b> avec données d\'exemple. Aucun paiement réel.</span><span class="seg" role="group" aria-label="Changer de profil">'
    +R.map(r=>'<button data-a="role" data-v="'+r[0]+'" aria-pressed="'+(S.role===r[0])+'">'+r[1]+'</button>').join('')+'</span>'
    +'<button class="btn ghost small" data-a="reset">Réinitialiser les données</button></div>';
}
function nav(){
  const r=S.role;
  let links='<button data-a="go" data-r="search">Rechercher un espace</button><button data-a="go" data-r="propose">Proposer un espace</button><button data-a="go" data-r="faq">Aide</button>';
  let right='<button class="link" data-a="login">Connexion</button><button class="btn small" data-a="login">Inscription</button>';
  if(r==='renter'){right='<button class="link" data-a="go" data-r="account">Mes réservations</button><span class="tag soft">Camille Martin · Studio Lumen</span>'}
  if(r==='host'){links='<button data-a="go" data-r="host">Extranet</button><button data-a="go" data-r="search">Voir la vitrine</button><button data-a="go" data-r="faq">Aide</button>';right='<span class="tag soft">Atelier Partners</span>'}
  if(r==='admin'){links='<button data-a="go" data-r="admin">Administration</button><button data-a="go" data-r="search">Voir la vitrine</button>';right='<span class="tag soft">Équipe MakomSpace</span>'}
  return '<nav class="top"><button class="logo" data-a="go" data-r="home" aria-label="MakomSpace, accueil">'+logo()+'<span>MAKOM<b>SPACE</b></span></button><div class="links">'+links+'</div><div class="navr">'+right+'</div></nav>';
}
function footerHtml(){return '<footer class="site"><span>MakomSpace · prototype de démonstration</span><span>Paiement sécurisé · Entreprises vérifiées · Contrat signé en ligne</span></footer>'}

/* ===== Accueil ===== */
function homeView(){
  const feat=S.spaces.filter(s=>s.status==='published').slice(0,6);
  return '<section class="hero"><div class="col" style="gap:14px"><span class="eyebrow">Locaux professionnels à la demande</span><h1>Recevez vos clients dans un vrai espace professionnel.</h1><p class="lead">Réservez une salle, un bureau, une boutique éphémère ou un studio à l\'heure, à la demi-journée ou à la journée. Sans abonnement.</p></div>'+searchForm(U.search)+'</section>'
  +'<section class="col"><h2>Choisissez votre usage</h2><div class="uses">'+Object.keys(TYPES).map(k=>'<button class="use" data-a="use" data-v="'+k+'"><b>'+TYPES[k]+'</b><span>'+TYPE_HINT[k]+'</span></button>').join('')+'</div></section>'
  +'<section class="compare"><div class="card"><span class="tag bad">Le café du coin</span><h3 style="margin-top:10px">Bruyant et public</h3><ul class="ul"><li>Wifi instable</li><li>Aucune confidentialité</li><li>Bruit de fond permanent</li></ul></div>'
  +'<div class="card" style="border-color:var(--gold)"><span class="tag gold">MakomSpace</span><h3 style="margin-top:10px">Un cadre professionnel, à l\'heure près</h3><ul class="ul"><li>Entreprises vérifiées avant publication</li><li>Créneau choisi à l\'heure, prix affiché pour votre durée</li><li>Équipements annoncés précisément, espace par espace</li></ul></div></section>'
  +'<section class="col"><div class="row between"><h2>Espaces à la une</h2><button class="btn ghost small" data-a="go" data-r="search">Tout voir</button></div><div class="grid g3">'+feat.map(s=>spCard(s)).join('')+'</div></section>'
  +'<section class="col"><h2>Comment ça marche ?</h2><div class="grid g2"><div class="card col"><span class="eyebrow">Pour les clients</span><div class="steps"><div class="st"><i>1</i><b>Recherchez</b><span class="muted small">Ville, date, heure de début, durée, personnes.</span></div><div class="st"><i>2</i><b>Réservez</b><span class="muted small">Choisissez votre créneau, signez le contrat, payez en ligne.</span></div><div class="st"><i>3</i><b>Travaillez</b><span class="muted small">Un code d\'accès valable sur votre créneau.</span></div></div></div>'
  +'<div class="card col"><span class="eyebrow">Pour les entreprises</span><div class="steps"><div class="st"><i>1</i><b>Listez</b><span class="muted small">Horaires, tarifs à l\'heure, règles, équipements.</span></div><div class="st"><i>2</i><b>Validation</b><span class="muted small">SIRET, assurance, conformité du local vérifiés.</span></div><div class="st"><i>3</i><b>Encaissez</b><span class="muted small">Reversement le lendemain, commission déduite.</span></div></div></div></div></section>'
  +'<section class="col"><h2>La garantie MakomSpace</h2><div class="grid g4">'
  +[['Paiement sécurisé','Prestataire certifié PCI-DSS. Débit seulement après acceptation.'],['Espaces vérifiés','SIRET, e-mail professionnel, adresse, attestation d\'assurance.'],['Contrat et caution','Contrat de mise à disposition signé en ligne, caution par pré-autorisation.'],['Réponse sous 24 h ouvrées','Question ou litige : une équipe vous répond.']].map(x=>'<div class="card flat"><h3>'+x[0]+'</h3><p class="muted small" style="margin-top:6px">'+x[1]+'</p></div>').join('')+'</div></section>';
}

/* ===== Recherche ===== */
function results(){
  const q=U.search;
  let l=S.spaces.filter(s=>s.status==='published').filter(s=>{
    if(q.city&&!(s.city+' '+s.zone).toLowerCase().includes(q.city.toLowerCase()))return false;
    if(q.type&&s.type!==q.type)return false;
    if(q.people&&+q.people>s.cap)return false;
    if(q.max&&s.hourly>+q.max)return false;
    if(q.equip.length&&!q.equip.every(e=>s.equip.includes(e)))return false;
    if(q.date&&q.start&&q.hours){if(+q.hours<s.min)return false;if(!rangeOk(s.id,q.date,+q.start,+q.start+q.hours*60))return false}
    else if(q.date){const cs=cells(s.id,q.date);if(!cs||!cs.some(c=>c.free))return false}
    return true;
  });
  if(q.sort==='asc')l.sort((a,b)=>a.hourly-b.hourly);else if(q.sort==='desc')l.sort((a,b)=>b.hourly-a.hourly);else l.sort((a,b)=>(avgRating(b.id)||b.rating)-(avgRating(a.id)||a.rating));
  return l;
}
function searchView(){
  const q=U.search,l=results();
  const cities={};S.spaces.filter(s=>s.status==='published').forEach(s=>{cities[s.city]=(cities[s.city]||0)+1});
  const pins=l.map(s=>'<g data-a="go" data-r="space" data-id="'+s.id+'" style="cursor:pointer"><circle cx="'+(s.pos[0]*300)+'" cy="'+(s.pos[1]*200)+'" r="7" fill="var(--gold)" stroke="var(--surface)" stroke-width="2"/><title>'+esc(s.title)+'</title></g>').join('');
  const labels=[['Paris',.52,.2],['Strasbourg',.82,.17],['Lyon',.62,.7],['Bordeaux',.3,.78]].map(c=>'<text x="'+(c[1]*300)+'" y="'+(c[2]*200)+'" font-size="9" text-anchor="middle" fill="var(--muted)" font-weight="700">'+c[0]+'</text>').join('');
  return '<section class="col"><h2>Rechercher un espace</h2>'+searchForm(q)+'</section>'
  +'<div class="layout"><aside class="card col side"><h3>Filtres</h3>'
  +field('Usage','<select data-bind="search.type" data-render>'+typeOpts(q.type)+'</select>')
  +field('Prix maximum / heure (€)','<input type="number" min="0" data-bind="search.max" data-render value="'+esc(q.max)+'" placeholder="Ex. 40">')
  +field('Trier par','<select data-bind="search.sort" data-render><option value="rel"'+(q.sort==='rel'?' selected':'')+'>Pertinence</option><option value="asc"'+(q.sort==='asc'?' selected':'')+'>Prix croissant</option><option value="desc"'+(q.sort==='desc'?' selected':'')+'>Prix décroissant</option></select>')
  +'<div class="col" style="gap:8px"><span class="small muted" style="font-weight:700">ÉQUIPEMENTS</span>'+EQUIP.map(e=>'<label class="chk"><input type="checkbox" data-a="eq" data-v="'+esc(e)+'"'+(q.equip.includes(e)?' checked':'')+'>'+e+'</label>').join('')+'</div>'
  +'<button class="btn ghost small" data-a="clear">Effacer les filtres</button></aside>'
  +'<div class="col"><div class="row between"><b>'+l.length+' espace'+(l.length>1?'s':'')+' trouvé'+(l.length>1?'s':'')+'</b>'+(q.date&&q.start&&q.hours?'<span class="tag ok">Libres le '+fdate(q.date)+' de '+hm(+q.start)+' à '+hm(+q.start+q.hours*60)+'</span>':'')+'</div>'
  +'<div class="mapbox"><svg viewBox="0 0 300 200" role="img" aria-label="Carte schématique des espaces" style="width:100%;height:auto;max-height:220px"><rect width="300" height="200" rx="10" fill="var(--bg)"/>'+labels+pins+'</svg><p class="muted small" style="padding:4px 6px">Carte schématique : cliquez un repère pour ouvrir la fiche.</p></div>'
  +(l.length?'<div class="grid g2">'+l.map(s=>spCard(s,q.date&&q.start&&q.hours?'Disponible '+hm(+q.start)+' – '+hm(+q.start+q.hours*60)+' · '+eur(quote(s,q.hours*60).total)+' TTC':'')).join('')+'</div>':'<div class="card"><b>Aucun espace ne correspond.</b><p class="muted small" style="margin-top:6px">Essayez une autre heure, une durée plus courte ou retirez un filtre.</p></div>')+'</div></div>';
}

/* ===== Fiche espace ===== */
function firstOpenDate(s){for(let i=0;i<21;i++){const k=dkey(addDays(TODAY,i)),cs=cells(s.id,k);if(cs&&cs.some(c=>c.free))return k}return dkey(TODAY)}
function priceNote(s,mins){const h=mins/60,base=h*s.hourly,cap=h<=4?s.half:s.half+(h-4)*s.hourly;if(s.day<=Math.min(base,cap))return 'Forfait journée appliqué';if(cap<base)return 'Forfait demi-journée appliqué';return 'Tarif horaire'}
function spaceView(){
  const s=sp(U.params.id);if(!s)return '<p>Espace introuvable.</p>';
  if(!U.sel.date||U.sel.sp!==s.id){U.sel={date:U.search.date||firstOpenDate(s),start:U.search.start?+U.search.start:null,end:U.search.start&&U.search.hours?+U.search.start+U.search.hours*60:null,sp:s.id};if(U.sel.start!=null&&!rangeOk(s.id,U.sel.date,U.sel.start,U.sel.end)){U.sel.start=null;U.sel.end=null}}
  const sel=U.sel,cs=cells(s.id,sel.date),revs=S.reviews.filter(x=>x.sp===s.id);
  let slots='';
  if(!cs)slots='<p class="muted small">Fermé ce jour-là. Choisissez une autre date.</p>';
  else slots='<div class="slots">'+cs.map(c=>{const inSel=sel.start!=null&&c.t>=sel.start&&c.t<sel.end;return '<button class="slot'+(inSel?' sel':'')+'" data-a="slot" data-t="'+c.t+'"'+(c.free?'':' disabled title="'+c.why+'"')+'>'+hm(c.t)+'</button>'}).join('')+'</div><p class="muted small" style="margin-top:8px">Pas de '+s.step+' min. Cliquez le début puis la fin. Les créneaux barrés sont pris, bloqués ou en remise en état.</p>';
  let panel='';
  const valid=sel.start!=null&&cs&&rangeOk(s.id,sel.date,sel.start,sel.end);
  if(sel.start!=null){
    const mins=sel.end-sel.start,q=quote(s,mins);
    if(mins<s.min*60)panel+='<p class="small" style="color:var(--warn);font-weight:600">Durée minimale : '+s.min+' h.</p>';
    else if(!valid)panel+='<p class="small" style="color:var(--bad);font-weight:600">Ce créneau chevauche une indisponibilité.</p>';
    panel+='<div class="qrow"><span>'+hm(sel.start)+' → '+hm(sel.end)+' ('+dur(mins)+')</span><span class="muted small">'+priceNote(s,mins)+'</span></div>';
    if(valid)panel+='<div class="qrow"><span>Location HT</span><b class="tnum">'+eur(q.ht)+'</b></div>'+(s.vat?'<div class="qrow"><span>TVA 20 %</span><span class="tnum">'+eur(q.vat)+'</span></div>':'<div class="qrow"><span>TVA</span><span class="muted">Non applicable</span></div>')+'<div class="qrow"><span>Frais de service</span><span class="tnum">'+eur(q.fee)+'</span></div><div class="qrow t"><span>Total TTC</span><span class="tnum">'+eur(q.total)+'</span></div><p class="muted small">Caution : '+(q.deposit?eur(q.deposit)+' en pré-autorisation, non débitée.':'aucune.')+'</p>';
  }else panel='<p class="muted small">Sélectionnez un créneau pour voir le prix.</p>';
  const hoursRows=[1,2,3,4,5,6,0].map(d=>'<tr><td>'+DAYS[d][0].toUpperCase()+DAYS[d].slice(1)+'</td><td>'+(s.hours[d]?hm(s.hours[d][0])+' – '+hm(s.hours[d][1]):'Fermé')+'</td></tr>').join('');
  return '<div class="col"><button class="btn ghost small" style="align-self:flex-start" data-a="go" data-r="search">← Retour aux résultats</button>'
  +'<div class="card" style="padding:0;overflow:hidden">'+plan(s)+'<p class="muted small" style="padding:8px 16px">Aperçu schématique. Les photos sont ajoutées par l\'hôte lors de la mise en ligne.</p></div></div>'
  +'<div class="layout s"><div class="col" style="gap:24px"><div class="col" style="gap:8px"><span class="muted small" style="font-weight:700;letter-spacing:.06em;text-transform:uppercase">'+TYPES[s.type]+' · '+esc(s.zone)+'</span><h1 style="font-size:clamp(26px,4vw,38px)">'+esc(s.title)+'</h1><div><button class="btn ghost small" data-a="fav" data-id="'+s.id+'">'+((S.fav||[]).includes(s.id)?'♥ Enregistré':'♡ Enregistrer')+'</button></div><p class="muted">Proposé par '+esc(s.owner)+' · jusqu\'à '+s.cap+' personnes</p><div class="row" style="gap:6px"><span class="tag">Entreprise vérifiée</span><span class="tag soft">Loué par un professionnel</span>'+(s.instant?'<span class="tag gold">Réservation immédiate</span>':'')+(revs.length?'<span class="tag soft">'+avgRating(s.id).toFixed(1)+' ★ ('+revs.length+')</span>':'')+'</div></div>'
  +'<p>'+esc(s.desc)+'</p>'
  +'<div class="grid g4"><div class="card flat kpi"><b>'+s.surface+' m²</b><span>Surface</span></div><div class="card flat kpi"><b>'+s.cap+'</b><span>Jauge légale maximale</span></div><div class="card flat kpi"><b>ERP '+s.erp.t+' · cat. '+s.erp.c+'</b><span>Type de local</span></div><div class="card flat kpi"><b>'+s.min+' h</b><span>Durée minimale</span></div></div>'
  +'<div class="col"><h3>Équipements</h3><div class="row" style="gap:6px">'+s.equip.map(e=>'<span class="tag soft">'+esc(e)+'</span>').join('')+'</div></div>'
  +'<div class="col"><h3>Adresse</h3><p>'+esc(s.addr)+'</p><p class="muted small">Les instructions d\'accès et le code sont envoyés une fois la réservation confirmée, actifs 15 minutes avant le début.</p></div>'
  +'<div class="grid g2"><div class="col"><h3>Horaires d\'ouverture</h3><table><tbody>'+hoursRows+'</tbody></table><p class="muted small">Heure locale Europe/Paris.</p></div>'
  +'<div class="col"><h3>Règles d\'usage</h3><ul class="ul">'+s.rules.map(r=>'<li>'+esc(r)+'</li>').join('')+'</ul><h3 style="margin-top:12px">Conditions d\'annulation · '+POLICY[s.cancel].name+'</h3><p class="muted small">'+POLICY[s.cancel].txt+'. Annulation gratuite tant que l\'hôte n\'a pas accepté. Les frais de service ne sont pas remboursables, sauf annulation par l\'hôte (remboursement à 100 %).</p></div></div>'
  +'<div class="col"><h3>Tarifs</h3><div class="row" style="gap:10px"><div class="card flat"><span class="muted small">À l\'heure</span><br><b class="tnum">'+eur(s.hourly)+'</b></div><div class="card flat"><span class="muted small">Demi-journée (4 h)</span><br><b class="tnum">'+eur(s.half)+'</b></div><div class="card flat"><span class="muted small">Journée</span><br><b class="tnum">'+eur(s.day)+'</b></div></div><p class="muted small">Prix HT. Le forfait le plus avantageux est appliqué automatiquement à votre durée.</p></div>'
  +'<div class="col"><h3>Avis des clients</h3>'+(revs.length?revs.map(x=>'<div class="card flat"><b>'+esc(x.who)+'</b> <span style="color:var(--gold)">'+stars(x.stars)+'</span><p class="muted small" style="margin-top:4px">'+esc(x.txt)+'</p></div>').join(''):'<p class="muted small">Pas encore d\'avis. Les avis sont laissés par des clients après une réservation qui a eu lieu.</p>')+'</div></div>'
  +'<aside class="card col side"><h3>Réserver</h3><label class="f">Date<input type="date" data-bind="sel.date" data-render data-reset="1" min="'+dkey(TODAY)+'" value="'+esc(sel.date)+'"></label>'+slots+'<div class="col" style="gap:2px">'+panel+'</div>'
  +'<button class="btn block" data-a="book"'+(valid?'':' disabled')+'>'+(s.instant?'Réserver immédiatement':'Envoyer la demande')+'</button><p class="muted small">'+(s.instant?'Confirmation immédiate après paiement.':'Vous ne serez débité qu\'après acceptation par l\'entreprise.')+'</p></aside></div>';
}

/* ===== Paiement et contrat ===== */
const sirenOk=v=>/^\d{14}$/.test(String(v).replace(/\s/g,''));
function checkoutView(){
  const s=sp(U.params.id),sel=U.sel,co=U.co;
  if(!s||sel.start==null)return '<p>Aucun créneau sélectionné.</p>';
  const q=quote(s,sel.end-sel.start);
  return '<div class="col"><button class="btn ghost small" style="align-self:flex-start" data-a="go" data-r="space" data-id="'+s.id+'">← Modifier le créneau</button><h1 style="font-size:clamp(26px,4vw,38px)">'+(s.instant?'Réserver':'Votre demande de réservation')+'</h1></div>'
  +'<div class="layout s"><div class="col" style="gap:18px">'
  +'<div class="card col"><h3>1. Votre événement</h3><div class="grid g2">'+field('Usage','<select data-bind="co.usage"><option value="">Choisir</option>'+['Réunion','Rendez-vous client','Atelier d\'équipe','Formation','Vente / boutique éphémère','Shooting','Entretien'].map(u=>'<option'+(co.usage===u?' selected':'')+'>'+u+'</option>').join('')+'</select>')+field('Personnes (maximum '+s.cap+')','<input type="number" min="1" max="'+s.cap+'" data-bind="co.people" value="'+esc(co.people)+'">')+'</div>'+field('Message à l\'hôte','<textarea data-bind="co.msg" placeholder="Matériel souhaité, arrivée, questions">'+esc(co.msg)+'</textarea>')+'</div>'
  +'<div class="card col"><h3>2. Votre entreprise</h3><div class="grid g2">'+field('Raison sociale','<input data-bind="co.company" value="'+esc(co.company)+'">')+field('SIRET (14 chiffres)','<input data-bind="co.siret" value="'+esc(co.siret)+'" inputmode="numeric">')+'</div><p class="small" id="siret-msg" style="color:var(--ok);font-weight:600">'+(sirenOk(co.siret)?'Établissement actif trouvé dans l\'annuaire des entreprises (contrôle simulé).':'')+'</p></div>'
  +'<div class="card col"><h3>3. Assurance et règles</h3><label class="chk"><input type="checkbox" data-bind="co.rc"'+(co.rc?' checked':'')+'> Mon entreprise est couverte en responsabilité civile pour cette activité (attestation disponible sur demande).</label><label class="chk"><input type="checkbox" data-bind="co.rule"'+(co.rule?' checked':'')+'> J\'ai lu les règles d\'usage : '+esc(s.rules.join(' ; '))+'.</label></div>'
  +'<div class="card col"><h3>4. Contrat de mise à disposition</h3><div class="small muted" style="border:1px solid var(--line);border-radius:12px;padding:12px;max-height:150px;overflow:auto">Entre '+esc(s.owner)+' (le « Mettant à disposition ») et '+esc(co.company||'le locataire')+' (l\'« Occupant »). Objet : mise à disposition temporaire, non exclusive et sans droit au bail, du local situé '+esc(s.addr)+', le '+fdate(sel.date)+' de '+hm(sel.start)+' à '+hm(sel.end)+'. L\'Occupant respecte la jauge de '+s.cap+' personnes, les règles d\'usage, restitue le local dans l\'état initial et signale tout dommage. Le dépôt de garantie fait l\'objet d\'une pré-autorisation de carte bancaire. Aucun statut de bail commercial ne s\'applique à cette mise à disposition.</div>'
  +field('Signature (nom et prénom)','<input data-bind="co.name" value="'+esc(co.name)+'" placeholder="Prénom Nom">')+'<label class="chk"><input type="checkbox" data-bind="co.contract"'+(co.contract?' checked':'')+'> J\'accepte le contrat et les conditions d\'annulation ('+POLICY[s.cancel].name+').</label></div>'
  +'<div class="card col"><h3>5. Paiement</h3><p class="small muted">Carte •••• 4242 (démonstration). '+(s.instant?'Le total est débité maintenant.':'Le total est autorisé maintenant et débité à l\'acceptation de l\'hôte.')+(q.deposit?' Caution de '+eur(q.deposit)+' en pré-autorisation.':'')+'</p></div></div>'
  +'<aside class="card col side"><h3>Récapitulatif</h3><b>'+esc(s.title)+'</b><span class="muted small">'+fdate(sel.date)+' · '+hm(sel.start)+' → '+hm(sel.end)+' ('+dur(sel.end-sel.start)+')</span>'
  +'<div class="qrow"><span>Location HT</span><b class="tnum">'+eur(q.ht)+'</b></div>'+(s.vat?'<div class="qrow"><span>TVA 20 %</span><span class="tnum">'+eur(q.vat)+'</span></div>':'')+'<div class="qrow"><span>Frais de service</span><span class="tnum">'+eur(q.fee)+'</span></div><div class="qrow t"><span>Total TTC</span><span class="tnum">'+eur(q.total)+'</span></div>'
  +'<button class="btn block" data-a="submit">'+(s.instant?'Payer et réserver':'Envoyer la demande')+'</button></aside></div>';
}
function doneView(){
  const r=S.res.find(x=>x.id===U.params.rid);if(!r)return '';const s=sp(r.spaceId);
  return '<div class="card col" style="max-width:640px;margin:0 auto;text-align:center;align-items:center;padding:36px"><span class="tag ok">'+(r.status==='confirmée'?'Réservation confirmée':'Demande envoyée')+'</span><h2>'+(r.status==='confirmée'?'C\'est réservé.':'Votre demande est envoyée.')+'</h2><p class="muted">'+esc(s.title)+' · '+fdate(r.date)+' · '+hm(r.start)+' → '+hm(r.end)+'</p><p>'+(r.status==='confirmée'?'Votre code d\'accès sera actif 15 minutes avant le début. Il apparaît dans votre réservation.':'L\'hôte répond sous 24 h ouvrées. Vous êtes débité seulement s\'il accepte. Annulation gratuite d\'ici là.')+'</p><div class="row"><button class="btn" data-a="go" data-r="res" data-id="'+r.id+'">Voir ma réservation</button><button class="btn ghost" data-a="go" data-r="home">Retour à l\'accueil</button></div></div>';
}

/* ===== Espace locataire ===== */
function resCard(r){
  const s=sp(r.spaceId);
  return '<div class="card col"><div class="row between"><b>'+esc(s.title)+'</b>'+stTag(r.status)+'</div><span class="muted small">'+r.id+' · '+fdate(r.date)+' · '+hm(r.start)+' → '+hm(r.end)+' · '+r.people+' pers. · '+esc(r.usage)+'</span><div class="row between"><b class="tnum">'+eur(r.total)+' TTC</b><button class="btn small" data-a="go" data-r="res" data-id="'+r.id+'">Ouvrir</button></div></div>';
}
function accountView(){
  const all=mine().sort((a,b)=>startTs(a)-startTs(b)),now=NOW();
  const tabs=[['upcoming','À venir'],['requests','Demandes'],['past','Passées'],['msgs','Messages']];
  let body='';
  if(U.tab==='upcoming'){const l=all.filter(r=>['acceptée','confirmée'].includes(r.status)&&tsOf(r.date,r.end)>now);body=l.length?'<div class="grid g2">'+l.map(resCard).join('')+'</div>':'<p class="muted">Aucune réservation à venir.</p>'}
  if(U.tab==='requests'){const l=all.filter(r=>r.status==='demande');body=l.length?'<div class="grid g2">'+l.map(resCard).join('')+'</div>':'<p class="muted">Aucune demande en attente.</p>'}
  if(U.tab==='past'){const l=all.filter(r=>['terminée','annulée','refusée'].includes(r.status)).reverse();body=l.length?'<div class="grid g2">'+l.map(resCard).join('')+'</div>':'<p class="muted">Aucune réservation passée.</p>'}
  if(U.tab==='msgs'){body='<div class="grid g2">'+all.filter(r=>S.msgs[r.id]).map(r=>'<div class="card col"><b>'+esc(sp(r.spaceId).title)+' · '+r.id+'</b>'+msgThread(r.id,'renter')+'</div>').join('')+'</div>'}
  return '<div class="col"><span class="eyebrow">Espace locataire</span><h1 style="font-size:clamp(28px,4vw,40px)">Mes réservations</h1></div><div class="tabs">'+tabs.map(t=>'<button data-a="tab" data-v="'+t[0]+'" aria-pressed="'+(U.tab===t[0])+'">'+t[1]+'</button>').join('')+'</div>'+body;
}
function resView(){
  const r=S.res.find(x=>x.id===U.params.id);if(!r)return '';
  const s=sp(r.spaceId),isHost=S.role==='host',me=isHost?'host':'renter';
  const steps=[['Demande envoyée',true],['Acceptée par l\'hôte',['acceptée','confirmée','terminée'].includes(r.status)],['Accès actif',['confirmée','terminée'].includes(r.status)],['Terminée',r.status==='terminée'],['Avis publié',r.reviewed]];
  const winStart=startTs(r)-900000,inWin=NOW()>=winStart&&NOW()<=tsOf(r.date,r.end);
  const showCode=r.code&&['acceptée','confirmée'].includes(r.status)&&(inWin||U.reveal[r.id]);
  const thumbs=a=>'<div class="thumbs">'+(a.length?a.map(x=>'<img alt="Photo d\'état des lieux" src="'+x+'">').join(''):'<span class="muted small">Aucune photo.</span>')+'</div>';
  return '<div class="col"><button class="btn ghost small" style="align-self:flex-start" data-a="go" data-r="'+(isHost?'host':'account')+'">← Retour</button><div class="row between"><h1 style="font-size:clamp(26px,4vw,36px)">'+esc(s.title)+'</h1>'+stTag(r.status)+'</div><span class="muted">'+r.id+' · '+fdate(r.date)+' · '+hm(r.start)+' → '+hm(r.end)+' · '+r.people+' pers. · '+esc(r.usage)+'</span></div>'
  +'<div class="card row" style="gap:18px">'+steps.map(x=>'<span class="row" style="gap:6px"><span class="tag '+(x[1]?'ok':'soft')+'">'+(x[1]?'✓':'·')+'</span><span class="small'+(x[1]?'':' muted')+'">'+x[0]+'</span></span>').join('')+'</div>'
  +'<div class="grid g2"><div class="col"><div class="card col"><h3>Accès au local</h3>'+(r.code&&['acceptée','confirmée'].includes(r.status)?(showCode?'<div class="code tnum">'+r.code+'</div><p class="muted small">Valable de '+hm(r.start-15)+' à '+hm(r.end)+' le '+fdate(r.date)+'. Se saisit sur le clavier de la porte. Journal d\'accès enregistré.</p>':'<p class="muted small">Le code s\'active 15 minutes avant le début ('+hm(r.start-15)+').</p><button class="btn small ghost" data-a="reveal" data-id="'+r.id+'" style="align-self:flex-start">Afficher le code (démo)</button>'):'<p class="muted small">Le code est disponible après acceptation.</p>')+'<p class="small">Adresse : '+esc(s.addr)+'</p></div>'
  +'<div class="card col"><h3>État des lieux</h3><span class="small" style="font-weight:700">À l\'entrée</span>'+thumbs(r.checkin)+'<label class="btn ghost small" style="align-self:flex-start;cursor:pointer">Ajouter des photos<input type="file" accept="image/*" multiple data-a="photo" data-id="'+r.id+'" data-k="checkin" style="display:none"></label><span class="small" style="font-weight:700">À la sortie</span>'+thumbs(r.checkout)+'<label class="btn ghost small" style="align-self:flex-start;cursor:pointer">Ajouter des photos<input type="file" accept="image/*" multiple data-a="photo" data-id="'+r.id+'" data-k="checkout" style="display:none"></label><p class="muted small">Photos horodatées, rattachées à la caution de '+eur(r.deposit||0)+'.</p></div>'
  +'<div class="card col"><h3>Messages</h3>'+msgThread(r.id,me)+'</div></div>'
  +'<div class="col"><div class="card col"><h3>Facture</h3><div class="qrow"><span>Location HT</span><span class="tnum">'+eur(r.ht)+'</span></div><div class="qrow"><span>TVA</span><span class="tnum">'+eur(r.vat)+'</span></div><div class="qrow"><span>Frais de service MakomSpace</span><span class="tnum">'+eur(r.fee)+'</span></div><div class="qrow t"><span>Total TTC</span><span class="tnum">'+eur(r.total)+'</span></div><p class="muted small">Facture de location émise au nom de '+esc(s.owner)+' par mandat. Facture des frais de service émise par MakomSpace.</p></div>'
  +'<div class="card col"><h3>Contrat signé</h3><p class="small">Mise à disposition temporaire sans droit au bail, signée par <b>'+esc(r.signed)+'</b> pour '+esc(r.company||'')+' (SIRET '+esc(r.siret||'')+').</p><p class="muted small">Jauge '+s.cap+' pers. · Règles : '+esc(s.rules.join(' ; '))+'.</p></div>'
  +(!isHost&&['demande','acceptée','confirmée'].includes(r.status)?'<div class="card col"><h3>Annulation</h3><p class="muted small">'+refundOf(r).label+'</p><button class="btn bad small" style="align-self:flex-start" data-a="cancelAsk" data-id="'+r.id+'">Annuler la réservation</button></div>':'')
  +(!isHost&&r.status==='terminée'&&!r.reviewed?'<div class="card col"><h3>Laisser un avis</h3><div class="row">'+[1,2,3,4,5].map(n=>'<button class="chip btn ghost small" data-a="star" data-v="'+n+'" style="'+(U.review.stars>=n?'color:var(--gold);border-color:var(--gold)':'')+'">'+n+' ★</button>').join('')+'</div><textarea class="in" data-bind="review.txt" placeholder="Votre retour sur le lieu, l\'accueil, la conformité à l\'annonce">'+esc(U.review.txt)+'</textarea><button class="btn small" style="align-self:flex-start" data-a="review" data-id="'+r.id+'">Publier l\'avis</button></div>':'')+'</div></div>';
}

/* ===== Pages d'information ===== */
function proposeView(){
  return '<section class="hero"><div class="col" style="gap:14px"><span class="eyebrow">Pour les entreprises</span><h1>Vos espaces inoccupés ont de la valeur.</h1><p class="lead">Proposez vos bureaux, salles, boutiques et studios à l\'heure, à la demi-journée ou à la journée. Vous gardez la main sur chaque demande.</p><div class="row"><button class="btn" data-a="role" data-v="host">Ouvrir l\'extranet bailleur (démo)</button></div></div></section>'
  +'<section class="grid g3">'+[['Rentabilisez vos mètres carrés','Une salle vide le mardi après-midi devient un revenu. Tarif horaire, demi-journée et journée.'],['Vous gardez la main','Acceptez ou refusez chaque demande. Horaires, fermetures et remise en état bloquent automatiquement les créneaux.'],['Des locataires professionnels','Entreprises identifiées, contrat signé, assurance exigée, caution en pré-autorisation.']].map(x=>'<div class="card"><h3>'+x[0]+'</h3><p class="muted small" style="margin-top:8px">'+x[1]+'</p></div>').join('')+'</section>'
  +'<section class="col"><h2>Comment ça marche ?</h2><div class="steps">'+[['Créez votre compte','Choisissez « Je publie un espace ».'],['Faites vérifier votre entreprise','SIRET, coordonnées, assurance, autorisation de sous-louer si vous êtes locataire.'],['Décrivez vos espaces','Adresse, jauge légale, type d\'ERP, équipements, photos, horaires, prix.'],['Recevez vos paiements','Reversement le lendemain du créneau, commission déduite.']].map((x,i)=>'<div class="card st"><i>'+(i+1)+'</i><b>'+x[0]+'</b><span class="muted small">'+x[1]+'</span></div>').join('')+'</div></section>';
}
function faqView(){
  const q=[['Comment se passe une réservation ?','Vous choisissez un créneau à l\'heure, signez le contrat et payez en ligne. L\'hôte accepte ou refuse. Pour les espaces à réservation immédiate, la confirmation est instantanée.'],['Quand suis-je débité ?','À l\'acceptation de l\'hôte. Avant, votre carte est seulement autorisée. La caution est une pré-autorisation, non débitée sauf dommage.'],['Le prix affiché comprend-il des frais ?','Le détail affiche la location HT, la TVA, les frais de service MakomSpace et le total TTC. Le forfait demi-journée ou journée s\'applique automatiquement quand il est plus avantageux.'],['Puis-je annuler ?','Gratuitement tant que l\'hôte n\'a pas accepté. Ensuite selon la politique de l\'espace (flexible, modérée ou ferme). Les frais de service ne sont pas remboursables, sauf annulation par l\'hôte.'],['Comment obtenir ma facture ?','Depuis la page de votre réservation : facture de location au nom de l\'hôte et facture des frais de service.'],['Pourquoi vérifiez-vous mon entreprise ?','Pour la confiance de tous : SIRET, assurance, et pour un hôte locataire l\'autorisation de sous-louer du propriétaire.'],['Dois-je accepter toutes les demandes ?','Non. Vous acceptez ou refusez. Sans réponse sous 24 h ouvrées, la demande expire et le client n\'est pas débité.'],['Qui émet les factures ?','L\'hôte, par mandat de facturation, pour la location ; MakomSpace pour ses frais de service et sa commission.']];
  return '<div class="col"><span class="eyebrow">Aide</span><h1 style="font-size:clamp(28px,4vw,40px)">Questions fréquentes</h1></div><div class="col">'+q.map(x=>'<details class="card flat"><summary style="cursor:pointer;font-weight:700">'+x[0]+'</summary><p class="muted" style="margin-top:8px">'+x[1]+'</p></details>').join('')+'</div>';
}
