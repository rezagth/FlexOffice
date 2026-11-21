/* ===== Extranet bailleur ===== */
function timeOptsR(sel,from,to){let o='';for(let t=from;t<=to;t+=30)o+='<option value="'+t+'"'+(+sel===t?' selected':'')+'>'+hm(t)+'</option>';return o}
function occupancy(days){
  let open=0,booked=0;
  hostSpaces().filter(s=>s.status==='published').forEach(s=>{for(let i=0;i<days;i++){const d=addDays(TODAY,i),h=s.hours[d.getDay()];if(!h)continue;open+=h[1]-h[0];S.res.filter(r=>r.spaceId===s.id&&r.date===dkey(d)&&['demande','acceptée','confirmée'].includes(r.status)).forEach(r=>{booked+=r.end-r.start})}});
  return open?Math.round(booked/open*100):0;
}
const TASKS=[['photos','Ajouter les photos du local'],['hours','Définir les horaires d\'ouverture'],['rates','Fixer les tarifs (heure, demi-journée, journée)'],['erp','Renseigner la jauge légale et le type d\'ERP'],['rc','Déposer l\'attestation d\'assurance du local'],['sublease','Joindre l\'autorisation de sous-louer du propriétaire'],['iban','Ajouter les coordonnées bancaires'],['kyb','Faire vérifier l\'entreprise (SIRET)']];
function hostView(){
  const pend=hostRes().filter(r=>r.status==='demande').length;
  const tabs=[['today','Aujourd\'hui'],['calendar','Calendrier'],['requests','Demandes',pend],['spaces','Espaces'],['revenue','Revenus'],['access','Accès et état des lieux'],['compliance','Conformité'],['messages','Messages']];
  let body='';
  const t=U.hostTab;
  if(t==='today')body=hostToday();
  if(t==='calendar')body=hostCalendar();
  if(t==='requests')body=hostRequests();
  if(t==='spaces')body=hostSpacesView();
  if(t==='revenue')body=hostRevenue();
  if(t==='access')body=hostAccess();
  if(t==='compliance')body=hostCompliance();
  if(t==='messages')body=hostMessages();
  return '<div class="col"><span class="eyebrow">Extranet bailleur · Atelier Partners</span></div><div class="layout"><aside class="card side"><div class="sidenav">'+tabs.map(x=>'<button data-a="hostTab" data-v="'+x[0]+'" aria-pressed="'+(t===x[0])+'"><span>'+x[1]+'</span>'+(x[2]?'<span class="tag warn">'+x[2]+'</span>':'')+'</button>').join('')+'</div></aside><div class="col" style="gap:20px">'+body+'</div></div>';
}
function hostToday(){
  const rs=hostRes(),now=NOW();
  const month=dkey(TODAY).slice(0,7);
  const rev=rs.filter(r=>['confirmée','terminée','acceptée'].includes(r.status)&&r.date.startsWith(month)).reduce((a,r)=>a+netOf(r),0);
  const nextArr=rs.filter(r=>['confirmée','acceptée'].includes(r.status)&&tsOf(r.date,r.end)>now).sort((a,b)=>startTs(a)-startTs(b)).slice(0,4);
  const done=Object.values(S.hostTasks).filter(Boolean).length;
  const tips=[];
  hostSpaces().forEach(s=>{if(!S.hostTasks.photos)tips.push('Ajoutez des photos à « '+s.title+' » : une annonce sans photo reçoit moins de demandes.');});
  if(S.hostTasks.photos===false)tips.length=1;
  tips.push('Activez la réservation immédiate sur « Salle de réunion Rivoli » pour les clients réguliers.');
  tips.push('Le samedi de 18h à 23h est libre sur le bureau : proposez un tarif week-end.');
  return '<h1 style="font-size:clamp(26px,4vw,36px)">Aujourd\'hui</h1><div class="grid g4"><div class="card kpi"><b>'+rs.filter(r=>r.status==='demande').length+'</b><span>demandes à traiter</span></div><div class="card kpi"><b>'+nextArr.length+'</b><span>prochaines arrivées</span></div><div class="card kpi"><b>'+occupancy(7)+' %</b><span>occupation des 7 prochains jours</span></div><div class="card kpi"><b>'+eur(rev)+'</b><span>net du mois après commission</span></div></div>'
  +'<div class="grid g2"><div class="card col"><div class="row between"><h3>Configuration de base</h3><span class="muted small">'+done+' tâches sur '+TASKS.length+'</span></div><div class="bar"><i style="width:'+Math.round(done/TASKS.length*100)+'%"></i></div>'+TASKS.map(x=>'<label class="chk"><input type="checkbox" data-a="task" data-k="'+x[0]+'"'+(S.hostTasks[x[0]]?' checked':'')+'>'+x[1]+'</label>').join('')+'</div>'
  +'<div class="col"><div class="card col"><h3>Prochaines arrivées</h3>'+(nextArr.length?nextArr.map(r=>'<div class="row between"><span class="small"><b>'+esc(sp(r.spaceId).title)+'</b><br>'+fdate(r.date)+' · '+hm(r.start)+' → '+hm(r.end)+' · '+esc(r.company||r.renter)+'</span><button class="btn ghost small" data-a="go" data-r="res" data-id="'+r.id+'">Ouvrir</button></div>').join(''):'<p class="muted small">Aucune arrivée à venir.</p>')+'</div>'
  +'<div class="card col"><h3>Conseils</h3><ul class="ul">'+tips.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></div></div></div>';
}
function evsOf(spaceId,date){
  const s=sp(spaceId),out=[];
  S.res.filter(r=>r.spaceId===spaceId&&r.date===date&&['demande','acceptée','confirmée'].includes(r.status)).forEach(r=>{
    if(s.buffer)out.push({a:r.start-s.buffer,b:r.start,cls:'buf',txt:''});
    out.push({a:r.start,b:r.end,cls:r.status,txt:hm(r.start)+' '+(r.company||r.renter),id:r.id});
    if(s.buffer)out.push({a:r.end,b:r.end+s.buffer,cls:'buf',txt:''});
  });
  (S.blocks[spaceId]||[]).filter(b=>b.date===date).forEach(b=>out.push({a:b.start,b:b.end,cls:'block',txt:'Bloqué'}));
  if(S.sync.google)(S.external[spaceId]||[]).filter(b=>b.date===date).forEach(b=>out.push({a:b.start,b:b.end,cls:'ext',txt:b.label}));
  return out;
}
function hostCalendar(){
  const sps=hostSpaces(),s=sp(U.hostSpace)&&sps.find(x=>x.id===U.hostSpace)?sp(U.hostSpace):sps[0];
  U.hostSpace=s.id;
  const monday=addDays(TODAY,(1-TODAY.getDay()+(TODAY.getDay()===0?-7:0))+U.week*7);
  const days=[0,1,2,3,4,5,6].map(i=>addDays(monday,i));
  let grid='<div class="hd"></div>'+days.map(d=>'<div class="hd">'+DAYS3[d.getDay()]+' '+d.getDate()+'/'+pad(d.getMonth()+1)+'</div>').join('');
  for(let h=8;h<23;h++){
    grid+='<div class="hr">'+pad(h)+'h</div>';
    days.forEach(d=>{
      const k=dkey(d),hrs=s.hours[d.getDay()],open=hrs&&h*60>=hrs[0]&&h*60+60<=hrs[1];
      const evs=evsOf(s.id,k).filter(e=>e.a>=h*60&&e.a<h*60+60);
      grid+='<div class="c'+(open?' can':' closed')+'"'+(open?' data-a="cell" data-d="'+k+'" data-h="'+h+'"':'')+'>'+evs.map(e=>'<div class="ev '+e.cls+'" style="top:'+(1+(e.a-h*60)/60*30)+'px;height:'+Math.max(14,((e.b-e.a)/60*30)-2)+'px"'+(e.id?' data-a="go" data-r="res" data-id="'+e.id+'"':'')+'>'+esc(e.txt)+'</div>').join('')+'</div>';
    });
  }
  return '<div class="row between"><h1 style="font-size:clamp(26px,4vw,36px)">Calendrier</h1><div class="row"><select class="in" style="width:auto" data-bind="hostSpace" data-render>'+sps.map(x=>'<option value="'+x.id+'"'+(x.id===s.id?' selected':'')+'>'+esc(x.title)+'</option>').join('')+'</select></div></div>'
  +'<div class="row between"><div class="row"><button class="btn ghost small" data-a="week" data-v="-1">←</button><b>Semaine du '+monday.getDate()+'/'+pad(monday.getMonth()+1)+'</b><button class="btn ghost small" data-a="week" data-v="1">→</button><button class="btn ghost small" data-a="week" data-v="0">Aujourd\'hui</button></div><div class="row"><label class="chk"><input type="checkbox" data-a="blockMode"'+(U.block?' checked':'')+'> Bloquer des heures au clic</label><label class="chk"><input type="checkbox" data-a="sync"'+(S.sync.google?' checked':'')+'> Agenda Google synchronisé</label></div></div>'
  +'<div class="row small" style="gap:14px"><span class="row" style="gap:5px"><i class="ev confirmée" style="position:static;width:14px;height:14px;display:inline-block"></i>Confirmée</span><span class="row" style="gap:5px"><i class="ev demande" style="position:static;width:14px;height:14px;display:inline-block"></i>Demande</span><span class="row" style="gap:5px"><i class="ev buf" style="position:static;width:14px;height:14px;display:inline-block"></i>Remise en état ('+s.buffer+' min)</span><span class="row" style="gap:5px"><i class="ev block" style="position:static;width:14px;height:14px;display:inline-block"></i>Bloqué</span><span class="row" style="gap:5px"><i class="ev ext" style="position:static;width:14px;height:14px;display:inline-block"></i>Agenda externe</span></div>'
  +'<div class="card scroll" style="padding:8px"><div class="week">'+grid+'</div></div>';
}
function hostRequests(){
  const l=hostRes().filter(r=>r.status==='demande').sort((a,b)=>a.created-b.created);
  return '<h1 style="font-size:clamp(26px,4vw,36px)">Demandes de réservation</h1>'+(l.length?l.map(r=>{
    const s=sp(r.spaceId),left=r.created+86400000-NOW(),exp=left<=0?'Expirée':'Expire dans '+Math.max(1,Math.round(left/3600000))+' h';
    return '<div class="card col"><div class="row between"><b>'+esc(s.title)+'</b><span class="tag '+(left<7200000?'bad':'warn')+'">'+exp+'</span></div><span class="muted small">'+r.id+' · '+fdate(r.date)+' · '+hm(r.start)+' → '+hm(r.end)+' ('+dur(r.end-r.start)+') · '+r.people+' pers. · '+esc(r.usage)+'</span>'
    +'<div class="grid g3"><div class="small"><span class="muted">Locataire</span><br><b>'+esc(r.renter)+'</b><br>'+esc(r.company||'')+'</div><div class="small"><span class="muted">Contrôles</span><br><span class="tag ok">SIRET actif</span> <span class="tag ok">RC déclarée</span> <span class="tag ok">Contrat signé</span></div><div class="small"><span class="muted">Vous recevrez</span><br><b class="tnum">'+eur(netOf(r))+'</b> net<br><span class="muted">sur '+eur(r.ht)+' HT, commission '+S.settings.commission+' %</span></div></div>'
    +'<div class="row"><button class="btn small" data-a="accept" data-id="'+r.id+'">Accepter</button><button class="btn ghost small" data-a="refuseAsk" data-id="'+r.id+'">Refuser</button><button class="btn ghost small" data-a="go" data-r="res" data-id="'+r.id+'">Ouvrir et écrire</button></div></div>'}).join(''):'<div class="card"><b>Aucune demande en attente.</b></div>');
}
function hostSpacesView(){
  const e=U.edit;
  if(e){
    const hrsRows=[1,2,3,4,5,6,0].map(d=>{const h=e.hrs[d];return '<tr><td>'+DAYS[d][0].toUpperCase()+DAYS[d].slice(1)+'</td><td><label class="chk"><input type="checkbox" data-bind="edit.hrs.'+d+'.closed"'+(h.closed?' checked':'')+'> Fermé</label></td><td><select class="in" data-bind="edit.hrs.'+d+'.o" data-num>'+timeOptsR(h.o,360,1320)+'</select></td><td><select class="in" data-bind="edit.hrs.'+d+'.c" data-num>'+timeOptsR(h.c,420,1380)+'</select></td></tr>'}).join('');
    const num=(l,p,v,extra)=>field(l,'<input type="number" data-num data-bind="edit.'+p+'" value="'+esc(v)+'" '+(extra||'')+'>');
    return '<div class="row between"><h1 style="font-size:clamp(26px,4vw,36px)">Modifier l\'espace</h1><div class="row"><button class="btn ghost small" data-a="editCancel">Annuler</button><button class="btn small" data-a="editSave">Enregistrer</button></div></div>'
    +'<div class="grid g2"><div class="col"><div class="card col"><h3>Description</h3>'+field('Titre','<input data-bind="edit.title" value="'+esc(e.title)+'">')+field('Type','<select data-bind="edit.type">'+Object.keys(TYPES).map(k=>'<option value="'+k+'"'+(e.type===k?' selected':'')+'>'+TYPES[k]+'</option>').join('')+'</select>')+field('Description','<textarea data-bind="edit.desc">'+esc(e.desc)+'</textarea>')+field('Adresse','<input data-bind="edit.addr" value="'+esc(e.addr)+'">')+'<div class="grid g2">'+num('Surface (m²)','surface',e.surface,'min="1"')+num('Jauge légale (personnes)','cap',e.cap,'min="1"')+'</div><div class="grid g2">'+field('Type d\'ERP','<select data-bind="edit.erp.t">'+['W','L','M','N','R','T','J'].map(x=>'<option'+(e.erp.t===x?' selected':'')+'>'+x+'</option>').join('')+'</select>')+field('Catégorie','<select data-bind="edit.erp.c" data-num>'+[1,2,3,4,5].map(x=>'<option'+(e.erp.c===x?' selected':'')+'>'+x+'</option>').join('')+'</select>')+'</div></div>'
    +'<div class="card col"><h3>Équipements</h3><div class="grid g2">'+EQUIP.map(q=>'<label class="chk"><input type="checkbox" data-a="eqEdit" data-v="'+esc(q)+'"'+(e.equip.includes(q)?' checked':'')+'>'+q+'</label>').join('')+'</div></div>'
    +'<div class="card col"><h3>Règles d\'usage (une par ligne)</h3><textarea data-bind="edit.rulesTxt">'+esc(e.rulesTxt)+'</textarea></div></div>'
    +'<div class="col"><div class="card col"><h3>Tarifs (HT)</h3><div class="grid g3">'+num('Heure (€)','hourly',e.hourly,'min="0"')+num('Demi-journée (€)','half',e.half,'min="0"')+num('Journée (€)','day',e.day,'min="0"')+'</div><p class="muted small">Le forfait le plus avantageux s\'applique automatiquement à la durée choisie par le client.</p></div>'
    +'<div class="card col"><h3>Réservation</h3><div class="grid g2">'+field('Pas des créneaux','<select data-bind="edit.step" data-num><option value="30"'+(e.step===30?' selected':'')+'>30 min</option><option value="60"'+(e.step===60?' selected':'')+'>1 h</option></select>')+num('Durée minimale (h)','min',e.min,'min="1"')+num('Remise en état (min)','buffer',e.buffer,'min="0" step="30"')+num('Préavis (h)','notice',e.notice,'min="0"')+num('Caution (€)','deposit',e.deposit,'min="0"')+field('Annulation','<select data-bind="edit.cancel">'+Object.keys(POLICY).map(k=>'<option value="'+k+'"'+(e.cancel===k?' selected':'')+'>'+POLICY[k].name+'</option>').join('')+'</select>')+'</div><label class="chk"><input type="checkbox" data-bind="edit.instant"'+(e.instant?' checked':'')+'> Réservation immédiate (sans validation)</label><label class="chk"><input type="checkbox" data-bind="edit.vat"'+(e.vat?' checked':'')+'> Location soumise à la TVA</label></div>'
    +'<div class="card col"><h3>Horaires d\'ouverture</h3><table><tbody>'+hrsRows+'</tbody></table></div>'
    +'<div class="col"><span class="small muted" style="font-weight:700">APERÇU DANS LA VITRINE</span>'+spCard(Object.assign({},e,{rules:e.rulesTxt.split('\n')}))+'</div></div></div>';
  }
  return '<div class="row between"><h1 style="font-size:clamp(26px,4vw,36px)">Mes espaces</h1><button class="btn small" data-a="newSpace">Ajouter un espace</button></div><div class="grid g2">'+hostSpaces().map(s=>'<div class="card col"><div class="row between"><b>'+esc(s.title)+'</b>'+(s.status==='published'?'<span class="tag ok">Publié</span>':'<span class="tag warn">En validation</span>')+'</div><span class="muted small">'+TYPES[s.type]+' · '+esc(s.zone)+' · '+s.cap+' pers. · ERP '+s.erp.t+' cat. '+s.erp.c+'</span><span class="small tnum">'+eur(s.hourly)+' / h · '+eur(s.half)+' demi-journée · '+eur(s.day)+' journée</span><span class="muted small">Créneaux de '+s.step+' min · minimum '+s.min+' h · remise en état '+s.buffer+' min · préavis '+s.notice+' h · '+(s.instant?'réservation immédiate':'sur demande')+'</span><div class="row"><button class="btn small" data-a="editOpen" data-id="'+s.id+'">Modifier</button><button class="btn ghost small" data-a="go" data-r="space" data-id="'+s.id+'">Voir la fiche</button></div></div>').join('')+'</div>';
}
function hostRevenue(){
  const l=hostRes().filter(r=>['confirmée','terminée','acceptée'].includes(r.status)).sort((a,b)=>startTs(b)-startTs(a));
  const paid=l.filter(r=>tsOf(r.date,r.end)+86400000<NOW()),up=l.filter(r=>!paid.includes(r));
  const sum=a=>a.reduce((x,r)=>x+netOf(r),0);
  return '<div class="row between"><h1 style="font-size:clamp(26px,4vw,36px)">Revenus</h1><button class="btn ghost small" data-a="csv" data-k="revenue">Copier l\'export CSV</button></div><div class="grid g3"><div class="card kpi"><b>'+eur(sum(paid))+'</b><span>versé</span></div><div class="card kpi"><b>'+eur(sum(up))+'</b><span>à venir</span></div><div class="card kpi"><b>'+S.settings.commission+' %</b><span>commission MakomSpace sur le HT</span></div></div>'
  +'<div class="card scroll"><table><thead><tr><th>Date</th><th>Espace</th><th>Location HT</th><th>Commission</th><th>Net</th><th>Versement</th></tr></thead><tbody>'+l.map(r=>{const done=paid.includes(r);return '<tr><td>'+fdate(r.date)+'</td><td>'+esc(sp(r.spaceId).title)+'</td><td class="tnum">'+eur(r.ht)+'</td><td class="tnum">−'+eur(r.ht-netOf(r))+'</td><td class="tnum"><b>'+eur(netOf(r))+'</b></td><td>'+(done?'<span class="tag ok">Versé</span>':'<span class="tag soft">J+1 après le créneau</span>')+'</td></tr>'}).join('')+'</tbody></table></div><p class="muted small">Le reversement a lieu le lendemain de la fin du créneau. Vous recevez une facture de commission par mois, et la facture de location est émise en votre nom par mandat.</p>';
}
function hostAccess(){
  const up=hostRes().filter(r=>['confirmée','acceptée'].includes(r.status)&&tsOf(r.date,r.end)>NOW()).sort((a,b)=>startTs(a)-startTs(b));
  const past=hostRes().filter(r=>r.status==='terminée').sort((a,b)=>startTs(b)-startTs(a));
  return '<h1 style="font-size:clamp(26px,4vw,36px)">Accès et état des lieux</h1><div class="card col"><h3>Codes à venir</h3>'+(up.length?'<div class="scroll"><table><thead><tr><th>Créneau</th><th>Espace</th><th>Code</th><th>Valable</th><th></th></tr></thead><tbody>'+up.map(r=>'<tr><td>'+fdate(r.date)+' · '+hm(r.start)+'</td><td>'+esc(sp(r.spaceId).title)+'</td><td class="tnum"><b>'+esc(r.code)+'</b></td><td class="small">'+hm(r.start-15)+' → '+hm(r.end)+'</td><td><button class="btn ghost small" data-a="regen" data-id="'+r.id+'">Régénérer</button></td></tr>').join('')+'</tbody></table></div>':'<p class="muted small">Aucun code à venir.</p>')+'<p class="muted small">Chaque code n\'est valable que sur le créneau, activé 15 minutes avant. Mode dégradé : boîte à clé ou présence de l\'hôte.</p></div>'
  +'<div class="card col"><h3>Journal d\'accès et états des lieux</h3>'+(past.length?past.map(r=>'<div class="row between"><span class="small"><b>'+esc(sp(r.spaceId).title)+'</b> · '+fdate(r.date)+'<br>Entrée '+hm(r.start-4)+' · sortie '+hm(r.end+3)+' · photos : '+r.checkin.length+' entrée, '+r.checkout.length+' sortie</span><button class="btn ghost small" data-a="go" data-r="res" data-id="'+r.id+'">Ouvrir</button></div>').join(''):'<p class="muted small">Aucun créneau terminé.</p>')+'</div>';
}
function hostCompliance(){
  const items=[['KYB','Entreprise vérifiée (SIRET, Kbis)',S.hostTasks.kyb],['Assurance','Attestation d\'assurance du local déposée',S.hostTasks.rc],['Sous-location','Autorisation du propriétaire (si vous êtes locataire du local)',S.hostTasks.sublease],['ERP','Jauge légale et type d\'ERP renseignés',S.hostTasks.erp],['Versements','Coordonnées bancaires',S.hostTasks.iban]];
  return '<h1 style="font-size:clamp(26px,4vw,36px)">Conformité</h1><div class="card col">'+items.map(x=>'<div class="row between"><span><b>'+x[0]+'</b><br><span class="muted small">'+x[1]+'</span></span><span class="tag '+(x[2]?'ok':'bad')+'">'+(x[2]?'Complet':'À fournir')+'</span></div>').join('')+'</div>'
  +'<div class="card col"><h3>Par espace</h3><div class="scroll"><table><thead><tr><th>Espace</th><th>ERP</th><th>Jauge</th><th>Statut</th></tr></thead><tbody>'+hostSpaces().map(s=>'<tr><td>'+esc(s.title)+'</td><td>'+s.erp.t+' · cat. '+s.erp.c+'</td><td>'+s.cap+' pers.</td><td>'+(s.status==='published'?'<span class="tag ok">Publié</span>':'<span class="tag warn">En validation</span>')+'</td></tr>').join('')+'</tbody></table></div><p class="muted small">Un local qui accueille des clients ou des invités peut relever du régime des établissements recevant du public. La jauge affichée aux clients est plafonnée à cet effectif. À faire valider par un professionnel.</p></div>';
}
function hostMessages(){
  const l=hostRes().filter(r=>S.msgs[r.id]);
  return '<h1 style="font-size:clamp(26px,4vw,36px)">Messages</h1><div class="grid g2">'+(l.length?l.map(r=>'<div class="card col"><b>'+esc(sp(r.spaceId).title)+' · '+r.id+'</b><span class="muted small">'+esc(r.renter)+'</span>'+msgThread(r.id,'host')+'</div>').join(''):'<div class="card">Aucun message.</div>')+'</div>';
}

/* ===== Administration ===== */
function adminView(){
  const tabs=[['overview','Vue d\'ensemble'],['verifs','Entreprises à vérifier',S.verifs.filter(v=>v.status==='attente').length],['listings','Annonces à valider',S.listingsReview.length],['disputes','Litiges',S.disputes.filter(d=>d.status==='ouvert').length],['finance','Commissions et fiscalité']];
  const t=U.adminTab;let body='';
  if(t==='overview')body=adminOverview();if(t==='verifs')body=adminVerifs();if(t==='listings')body=adminListings();if(t==='disputes')body=adminDisputes();if(t==='finance')body=adminFinance();
  return '<div class="col"><span class="eyebrow">Administration MakomSpace</span></div><div class="layout"><aside class="card side"><div class="sidenav">'+tabs.map(x=>'<button data-a="adminTab" data-v="'+x[0]+'" aria-pressed="'+(t===x[0])+'"><span>'+x[1]+'</span>'+(x[2]?'<span class="tag warn">'+x[2]+'</span>':'')+'</button>').join('')+'</div></aside><div class="col" style="gap:20px">'+body+'</div></div>';
}
function adminOverview(){
  const ok=S.res.filter(r=>['confirmée','terminée','acceptée'].includes(r.status)),gmv=ok.reduce((a,r)=>a+r.total,0),comm=ok.reduce((a,r)=>a+(r.ht-netOf(r))+r.fee/1.2,0);
  const dec=S.res.filter(r=>['confirmée','terminée','acceptée','refusée'].includes(r.status)),acc=dec.length?Math.round(dec.filter(r=>r.status!=='refusée').length/dec.length*100):0;
  return '<h1 style="font-size:clamp(26px,4vw,36px)">Vue d\'ensemble</h1><div class="grid g4"><div class="card kpi"><b>'+eur(gmv)+'</b><span>volume réservé TTC</span></div><div class="card kpi"><b>'+eur(comm)+'</b><span>revenus MakomSpace HT</span></div><div class="card kpi"><b>'+S.res.length+'</b><span>réservations</span></div><div class="card kpi"><b>'+acc+' %</b><span>demandes acceptées</span></div></div>'
  +'<div class="grid g3"><div class="card kpi"><b>'+S.verifs.filter(v=>v.status==='attente').length+'</b><span>entreprises à vérifier</span></div><div class="card kpi"><b>'+S.listingsReview.length+'</b><span>annonces à valider</span></div><div class="card kpi"><b>'+S.disputes.filter(d=>d.status==='ouvert').length+'</b><span>litiges ouverts</span></div></div>'
  +'<div class="card col"><h3>Dernières réservations</h3><div class="scroll"><table><thead><tr><th>N°</th><th>Espace</th><th>Date</th><th>Total TTC</th><th>Statut</th></tr></thead><tbody>'+S.res.slice().sort((a,b)=>b.created-a.created).slice(0,8).map(r=>'<tr><td>'+r.id+'</td><td>'+esc(sp(r.spaceId).title)+'</td><td>'+fdate(r.date)+' '+hm(r.start)+'</td><td class="tnum">'+eur(r.total)+'</td><td>'+stTag(r.status)+'</td></tr>').join('')+'</tbody></table></div></div>';
}
function adminVerifs(){
  const dtag=(v,l)=>v===null?'':'<span class="tag '+(v?'ok':'bad')+'">'+l+(v?'':' manquant')+'</span> ';
  return '<h1 style="font-size:clamp(26px,4vw,36px)">Entreprises à vérifier</h1>'+S.verifs.map(v=>{
    const miss=Object.values(v.docs).some(x=>x===false);
    return '<div class="card col"><div class="row between"><b>'+esc(v.company)+' · '+v.kind+'</b>'+(v.status==='attente'?'<span class="tag warn">En attente</span>':v.status==='validé'?'<span class="tag ok">Validée</span>':'<span class="tag bad">Refusée</span>')+'</div><span class="muted small">SIRET '+v.siret.replace(/(\d{3})(\d{3})(\d{3})(\d{5})/,'$1 $2 $3 $4')+' · annuaire des entreprises : établissement actif (contrôle simulé)</span><div>'+dtag(v.docs.kbis,'Kbis')+dtag(v.docs.rc,'Assurance')+dtag(v.docs.sublease,'Autorisation de sous-louer')+dtag(v.docs.iban,'IBAN')+'</div>'
    +(v.status==='attente'?'<div class="row"><button class="btn small" data-a="verif" data-id="'+v.id+'" data-v="validé"'+(miss?' disabled title="Document manquant"':'')+'>Valider</button><button class="btn ghost small" data-a="verif" data-id="'+v.id+'" data-v="refusé">Refuser</button>'+(miss?'<span class="small" style="color:var(--warn)">Demander le document manquant avant validation.</span>':'')+'</div>':'')+'</div>'}).join('');
}
function adminListings(){
  return '<h1 style="font-size:clamp(26px,4vw,36px)">Annonces à valider</h1>'+(S.listingsReview.length?S.listingsReview.map(l=>{
    const s=sp(l.id),all=Object.values(l.checks).every(Boolean);
    const L={photos:'Photos présentes',jauge:'Jauge légale cohérente avec la surface',erp:'Type d\'ERP renseigné',regles:'Règles d\'usage rédigées'};
    return '<div class="card col"><div class="row between"><b>'+esc(s.title)+'</b><span class="muted small">'+esc(s.owner)+' · '+esc(s.zone)+'</span></div>'+Object.keys(L).map(k=>'<label class="chk"><input type="checkbox" data-a="lcheck" data-id="'+l.id+'" data-k="'+k+'"'+(l.checks[k]?' checked':'')+'>'+L[k]+'</label>').join('')+'<div class="row"><button class="btn small" data-a="publish" data-id="'+l.id+'"'+(all?'':' disabled')+'>Publier</button>'+(all?'':'<span class="small muted">Tous les points doivent être validés.</span>')+'</div></div>'}).join(''):'<div class="card">Aucune annonce en attente.</div>');
}
function adminDisputes(){
  return '<h1 style="font-size:clamp(26px,4vw,36px)">Litiges</h1>'+S.disputes.map(d=>'<div class="card col"><div class="row between"><b>'+d.id+' · '+esc(d.title)+'</b><span class="tag '+(d.status==='ouvert'?'warn':'ok')+'">'+(d.status==='ouvert'?'Ouvert':'Résolu')+'</span></div><span class="muted small">Réservation '+d.res+(d.amount?' · montant réclamé '+eur(d.amount)+' sur la caution':'')+'</span>'+(d.note?'<p class="small">'+esc(d.note)+'</p>':'')+(d.status==='ouvert'?'<div class="row"><button class="btn small" data-a="dispute" data-id="'+d.id+'" data-v="retenue">Retenir '+eur(d.amount)+' sur la caution</button><button class="btn ghost small" data-a="dispute" data-id="'+d.id+'" data-v="rejet">Rejeter la demande</button></div>':'')+'</div>').join('');
}
function adminFinance(){
  const hosts={};S.res.filter(r=>['confirmée','terminée','acceptée'].includes(r.status)).forEach(r=>{const o=sp(r.spaceId).owner;hosts[o]=hosts[o]||{n:0,v:0};hosts[o].n++;hosts[o].v+=netOf(r)});
  return '<h1 style="font-size:clamp(26px,4vw,36px)">Commissions et fiscalité</h1><div class="card col"><h3>Paramètres</h3><div class="grid g3">'+field('Commission hôte (% du HT)','<input type="number" data-num data-bind="tmp.commission" value="'+esc(U.tmp.commission!=null?U.tmp.commission:S.settings.commission)+'" min="0" max="40">')+field('Frais de service client (% du HT)','<input type="number" data-num data-bind="tmp.fee" value="'+esc(U.tmp.fee!=null?U.tmp.fee:S.settings.fee)+'" min="0" max="30">')+field('TVA applicable (%)','<input type="number" data-num data-bind="tmp.tva" value="'+esc(U.tmp.tva!=null?U.tmp.tva:S.settings.tva)+'" min="0" max="25">')+'</div><button class="btn small" style="align-self:flex-start" data-a="saveSettings">Enregistrer</button><p class="muted small">Les nouveaux paramètres s\'appliquent aux prochaines réservations.</p></div>'
  +'<div class="card col"><div class="row between"><h3>Déclaration annuelle des revenus des hôtes</h3><button class="btn ghost small" data-a="csv" data-k="dac7">Copier l\'export CSV</button></div><div class="scroll"><table><thead><tr><th>Hôte</th><th>Transactions</th><th>Revenus nets</th></tr></thead><tbody>'+Object.keys(hosts).map(h=>'<tr><td>'+esc(h)+'</td><td>'+hosts[h].n+'</td><td class="tnum">'+eur(hosts[h].v)+'</td></tr>').join('')+'</tbody></table></div><p class="muted small">Identité, adresse, numéro fiscal et SIRET sont collectés à l\'inscription de chaque hôte pour cette déclaration. À valider avec un conseil fiscal.</p></div>';
}

/* ===== Modales ===== */
function modalHtml(){
  const m=U.modal;if(!m)return '';
  let inner='';
  if(m.t==='login')inner='<h3>Connexion (démonstration)</h3><p class="muted small">Aucun mot de passe : choisissez un profil pour explorer le prototype.</p><button class="btn block" data-a="loginAs" data-v="renter">Locataire · Camille Martin</button><button class="btn ghost block" data-a="loginAs" data-v="host">Bailleur · Atelier Partners</button><button class="btn ghost block" data-a="loginAs" data-v="admin">Administrateur</button>';
  if(m.t==='cancel'){const r=S.res.find(x=>x.id===m.id),f=refundOf(r);inner='<h3>Annuler cette réservation ?</h3><p class="small">'+f.label+'</p><div class="qrow"><span>Remboursement du loyer</span><b class="tnum">'+eur(f.rent)+'</b></div><div class="qrow"><span>Frais de service remboursés</span><span class="tnum">'+eur(f.fee)+'</span></div><div class="row"><button class="btn bad small" data-a="cancelDo" data-id="'+r.id+'">Confirmer l\'annulation</button><button class="btn ghost small" data-a="closeModal">Garder la réservation</button></div>'}
  if(m.t==='refuse')inner='<h3>Refuser la demande</h3><p class="muted small">Le client est prévenu et n\'est pas débité.</p><label class="f">Motif<select data-bind="tmp.reason"><option>Créneau indisponible</option><option>Usage non compatible avec le local</option><option>Informations insuffisantes</option></select></label><div class="row"><button class="btn bad small" data-a="refuseDo" data-id="'+m.id+'">Refuser</button><button class="btn ghost small" data-a="closeModal">Retour</button></div>';
  if(m.t==='csv')inner='<h3>Export CSV</h3><p class="muted small">Copiez ce contenu (le téléchargement direct n\'est pas disponible dans cet aperçu).</p><textarea class="in" readonly style="min-height:160px" id="csvbox">'+esc(m.text)+'</textarea><button class="btn small" data-a="closeModal">Fermer</button>';
  return '<div class="modal" data-a="closeModalBg"><div class="box" role="dialog" aria-modal="true">'+inner+'</div></div>';
}
