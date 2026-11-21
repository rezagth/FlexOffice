/* ===== Rendu ===== */
function view(){
  const r=U.route;
  if(r==='home')return homeRest();
  if(r==='search')return searchView();
  if(r==='space')return spaceView();
  if(r==='book')return checkoutView();
  if(r==='done')return doneView();
  if(r==='account')return accountView();
  if(r==='res')return resView();
  if(r==='host')return hostView();
  if(r==='admin')return adminView();
  if(r==='propose')return proposeView();
  if(r==='faq')return faqView();
  if(r==='fav')return favView();
  return homeRest();
}
function render(keepScroll){
  const y=window.scrollY;
  if(U.route==='home'){
    document.body.classList.add('full');
    $('#app').innerHTML='<div class="pad">'+demoBar()+'</div>'+homeNav()+heroBand()+'<div class="pad"><main>'+homeRest()+'</main>'+footerHtml()+'</div>';
  }else{
    document.body.classList.remove('full');
    $('#app').innerHTML=demoBar()+nav()+'<main>'+view()+'</main>'+footerHtml();
  }
  $('#layer').innerHTML=modalHtml();
  if(keepScroll)window.scrollTo(0,y);
}
function toast(msg){
  let t=$('#toast');if(!t){t=document.createElement('div');t.id='toast';t.className='toast';t.setAttribute('role','status');document.body.appendChild(t)}
  t.textContent=msg;t.hidden=false;clearTimeout(toast.h);toast.h=setTimeout(()=>{t.hidden=true},2600);
}
function setPath(path,val){
  const k=path.split('.');let o=U;for(let i=0;i<k.length-1;i++){if(o[k[i]]==null)o[k[i]]={};o=o[k[i]]}
  o[k[k.length-1]]=val;
}
function go(r,p){U.route=r;U.params=p||{};U.modal=null;U.menuOpen=false;render();window.scrollTo(0,0)}
function csvOf(k){
  if(k==='revenue')return 'Date;Espace;Location HT;Commission;Net\n'+hostRes().filter(r=>['confirmée','terminée','acceptée'].includes(r.status)).map(r=>[r.date,sp(r.spaceId).title,r.ht,(r.ht-netOf(r)).toFixed(2),netOf(r)].join(';')).join('\n');
  const h={};S.res.filter(r=>['confirmée','terminée','acceptée'].includes(r.status)).forEach(r=>{const o=sp(r.spaceId).owner;h[o]=h[o]||{n:0,v:0};h[o].n++;h[o].v+=netOf(r)});
  return 'Hôte;Transactions;Revenus nets\n'+Object.keys(h).map(o=>[o,h[o].n,h[o].v.toFixed(2)].join(';')).join('\n');
}
const rnd6=()=>String(Math.floor(100000+Math.random()*900000));

/* ===== Actions ===== */
A.go=d=>go(d.r,d.id?{id:d.id}:{});
A.role=d=>{S.role=d.v;U.modal=null;save();go({visitor:'home',renter:'account',host:'host',admin:'admin'}[d.v])};
A.reset=()=>{S=seed();U.edit=null;U.sel={date:'',start:null,end:null};save();go('home');toast('Données d\'exemple réinitialisées')};
A.login=()=>{U.modal={t:'login'};render(true)};
A.menu=()=>{U.menuOpen=!U.menuOpen;render(true)};
A.resa=()=>{U.menuOpen=false;if(S.role==='visitor'){A.login();return}go({renter:'account',host:'host',admin:'admin'}[S.role])};
A.profil=A.resa;
A.notif=()=>{const n=notifCount();toast(n?(S.role==='host'?n+' demande(s) à traiter':S.role==='admin'?n+' élément(s) à traiter':n+' réservation(s) à venir'):'Aucune nouvelle notification')};
A.fav=d=>{S.fav=S.fav||[];const i=S.fav.indexOf(d.id);if(i>=0)S.fav.splice(i,1);else S.fav.push(d.id);save();render(true);toast(i>=0?'Retiré des favoris':'Ajouté aux favoris')};
A.loginAs=d=>A.role(d);
A.closeModal=()=>{U.modal=null;render(true)};
A.closeModalBg=(d,el,e)=>{if(e.target===el)A.closeModal()};
A.search=()=>{U.route='search';U.modal=null;render();window.scrollTo(0,0)};
A.use=d=>{U.search.type=d.v;A.search()};
A.eq=(d,el)=>{const q=U.search.equip,i=q.indexOf(d.v);if(el.checked&&i<0)q.push(d.v);if(!el.checked&&i>=0)q.splice(i,1);render(true)};
A.clear=()=>{U.search={city:'',date:'',start:'',hours:'',people:'',type:'',max:'',equip:[],sort:'rel'};render(true)};
A.slot=d=>{
  const s=sp(U.params.id),t=+d.t,sel=U.sel;
  const freeRange=(a,b)=>{const cs=cells(s.id,sel.date);for(let x=a;x<b;x+=s.step){const c=cs&&cs.find(y=>y.t===x);if(!c||!c.free)return false}return true};
  if(sel.start==null||t<sel.end&&t>=sel.start&&sel.end-sel.start>s.step||t<sel.start){sel.start=t;sel.end=t+s.step}
  else if(t>=sel.end||t===sel.start){const end=Math.max(t+s.step,sel.start+s.step);if(freeRange(sel.start,end))sel.end=end;else{sel.start=t;sel.end=t+s.step}}
  render(true);
};
A.book=()=>{
  const s=sp(U.params.id);
  if(S.role==='visitor'){U.modal={t:'login'};render(true);return}
  if(S.role!=='renter'){S.role='renter';save();toast('Profil locataire activé pour réserver')}
  if(!rangeOk(s.id,U.sel.date,U.sel.start,U.sel.end)){toast('Créneau indisponible');return}
  U.co.name=U.co.name||'';
  go('book',{id:s.id});
};
A.submit=()=>{
  const s=sp(U.params.id),co=U.co,sel=U.sel;
  const err=!co.usage?'Choisissez l\'usage':(!(+co.people>=1&&+co.people<=s.cap)?'Nombre de personnes : 1 à '+s.cap+' maximum':(!sirenOk(co.siret)?'SIRET : 14 chiffres':(!co.rc?'Confirmez la couverture en responsabilité civile':(!co.rule?'Confirmez avoir lu les règles d\'usage':((co.name||'').trim().length<3?'Signez le contrat avec votre nom':(!co.contract?'Acceptez le contrat':''))))));
  if(err){toast(err);return}
  if(!rangeOk(s.id,sel.date,sel.start,sel.end)){toast('Ce créneau vient d\'être pris');return}
  const q=quote(s,sel.end-sel.start),id=nextId();
  const r=Object.assign({id,spaceId:s.id,date:sel.date,start:sel.start,end:sel.end,people:+co.people,usage:co.usage,status:s.instant?'confirmée':'demande',created:NOW(),signed:co.name.trim(),rc:true,code:s.instant?rnd6():'',renter:'Camille Martin',company:co.company,siret:co.siret,checkin:[],checkout:[],reviewed:false},q);
  S.res.push(r);if(co.msg.trim())S.msgs[id]=[{from:'renter',text:co.msg.trim(),ts:NOW()}];
  U.co.msg='';U.co.rc=false;U.co.rule=false;U.co.contract=false;U.co.name='';U.sel={date:'',start:null,end:null};
  save();go('done',{rid:id});
};
A.tab=d=>{U.tab=d.v;render(true)};
A.reveal=d=>{U.reveal[d.id]=true;render(true)};
A.cancelAsk=d=>{U.modal={t:'cancel',id:d.id};render(true)};
A.cancelDo=d=>{const r=S.res.find(x=>x.id===d.id);r.status='annulée';U.modal=null;save();render(true);toast('Réservation annulée')};
A.star=d=>{U.review.stars=+d.v;render(true)};
A.review=d=>{
  const r=S.res.find(x=>x.id===d.id);
  S.reviews.push({sp:r.spaceId,who:'Camille M.',stars:U.review.stars,txt:U.review.txt||'(sans commentaire)',date:dkey(TODAY)});
  r.reviewed=true;U.review={stars:5,txt:''};save();render(true);toast('Avis publié');
};
A.send=d=>{
  const t=(U.draft[d.id]||'').trim();if(!t){toast('Écrivez un message');return}
  (S.msgs[d.id]=S.msgs[d.id]||[]).push({from:d.me,text:t,ts:NOW()});U.draft[d.id]='';save();render(true);
};
A.photo=(d,el)=>{
  const r=S.res.find(x=>x.id===d.id),files=Array.from(el.files||[]).slice(0,4);if(!files.length)return;
  let n=0;files.forEach(f=>{const fr=new FileReader();fr.onload=()=>{r[d.k].push(fr.result);n++;if(n===files.length){save();render(true);toast('Photos ajoutées')}};fr.readAsDataURL(f)});
};
/* extranet bailleur */
A.hostTab=d=>{U.hostTab=d.v;U.edit=null;render();window.scrollTo(0,0)};
A.task=(d,el)=>{S.hostTasks[d.k]=el.checked;save();render(true)};
A.week=d=>{U.week=d.v==='0'?0:U.week+(+d.v);render(true)};
A.blockMode=(d,el)=>{U.block=el.checked;render(true)};
A.sync=(d,el)=>{S.sync.google=el.checked;save();render(true)};
A.cell=d=>{
  if(!U.block){toast('Activez « Bloquer des heures au clic » pour modifier la disponibilité');return}
  const id=U.hostSpace,h=+d.h,list=S.blocks[id]=S.blocks[id]||[];
  const i=list.findIndex(b=>b.date===d.d&&b.start===h*60);
  if(i>=0)list.splice(i,1);else{
    const iv=intervals(id,d.d).filter(x=>x.kind==='res'&&h*60<x.b&&h*60+60>x.a);
    if(iv.length){toast('Une réservation occupe déjà cette heure');return}
    list.push({date:d.d,start:h*60,end:h*60+60});
  }
  save();render(true);
};
A.accept=d=>{const r=S.res.find(x=>x.id===d.id);r.status='confirmée';r.code=r.code||rnd6();save();render(true);toast('Demande acceptée. Le client est débité, le code est généré.')};
A.refuseAsk=d=>{U.tmp.reason='Créneau indisponible';U.modal={t:'refuse',id:d.id};render(true)};
A.refuseDo=d=>{const r=S.res.find(x=>x.id===d.id);r.status='refusée';(S.msgs[r.id]=S.msgs[r.id]||[]).push({from:'host',text:'Demande refusée : '+(U.tmp.reason||'Créneau indisponible')+'.',ts:NOW()});U.modal=null;save();render(true);toast('Demande refusée. Le client n\'est pas débité.')};
A.regen=d=>{const r=S.res.find(x=>x.id===d.id);r.code=rnd6();save();render(true);toast('Nouveau code généré')};
A.editOpen=d=>{
  const s=JSON.parse(JSON.stringify(sp(d.id)));
  s.hrs={};[0,1,2,3,4,5,6].forEach(k=>{const h=s.hours[k];s.hrs[k]={closed:!h,o:h?h[0]:540,c:h?h[1]:1080}});
  s.rulesTxt=s.rules.join('\n');U.edit=s;render();window.scrollTo(0,0);
};
A.editCancel=()=>{U.edit=null;render()};
A.eqEdit=(d,el)=>{const q=U.edit.equip,i=q.indexOf(d.v);if(el.checked&&i<0)q.push(d.v);if(!el.checked&&i>=0)q.splice(i,1)};
A.editSave=()=>{
  const e=U.edit,hours={};
  for(const k of [0,1,2,3,4,5,6]){const h=e.hrs[k];if(!h.closed){if(+h.o>=+h.c){toast('Horaires incohérents pour '+DAYS[k]);return}hours[k]=[+h.o,+h.c]}else hours[k]=null}
  if(!e.title||!(e.hourly>=0)||!(e.cap>=1)){toast('Titre, tarif et jauge sont obligatoires');return}
  const o=sp(e.id);
  Object.assign(o,{title:e.title,type:e.type,desc:e.desc,addr:e.addr,surface:+e.surface,cap:+e.cap,erp:{t:e.erp.t,c:+e.erp.c},equip:e.equip,hourly:+e.hourly,half:+e.half,day:+e.day,step:+e.step,min:+e.min,buffer:+e.buffer,notice:+e.notice,deposit:+e.deposit,cancel:e.cancel,instant:!!e.instant,vat:!!e.vat,hours,rules:e.rulesTxt.split('\n').map(x=>x.trim()).filter(Boolean)});
  U.edit=null;save();render();window.scrollTo(0,0);toast('Espace enregistré. La vitrine est à jour.');
};
A.newSpace=()=>{
  const id='espace-'+(S.spaces.length+1);
  S.spaces.push({id,title:'Nouvel espace',type:'MEETING',city:'Paris',zone:'Paris',addr:'À compléter',pos:[.5,.3],cap:6,erp:{t:'W',c:5},surface:20,desc:'À compléter.',equip:['Wifi'],hours:H(m(9),m(18),null,null),step:60,hourly:30,half:90,day:150,min:1,buffer:30,notice:4,instant:false,vat:true,deposit:100,cancel:'moderate',rules:['À compléter'],owner:'Atelier Partners',status:'review',rating:0,nrev:0});
  S.listingsReview.push({id,checks:{photos:false,jauge:false,erp:false,regles:false}});save();A.editOpen({id});
};
/* administration */
A.adminTab=d=>{U.adminTab=d.v;render();window.scrollTo(0,0)};
A.verif=d=>{const v=S.verifs.find(x=>x.id===d.id);v.status=d.v;save();render(true);toast(d.v==='validé'?'Entreprise validée':'Entreprise refusée')};
A.lcheck=(d,el)=>{S.listingsReview.find(x=>x.id===d.id).checks[d.k]=el.checked;save();render(true)};
A.publish=d=>{sp(d.id).status='published';S.listingsReview=S.listingsReview.filter(x=>x.id!==d.id);save();render(true);toast('Annonce publiée dans la vitrine')};
A.dispute=d=>{const x=S.disputes.find(y=>y.id===d.id);x.status='résolu';x.note=d.v==='retenue'?'Montant retenu sur la caution et reversé à l\'hôte.':'Demande rejetée après examen des photos d\'état des lieux.';save();render(true)};
A.saveSettings=()=>{
  const t=U.tmp;
  if(t.commission!=null)S.settings.commission=+t.commission;if(t.fee!=null)S.settings.fee=+t.fee;if(t.tva!=null)S.settings.tva=+t.tva;
  U.tmp={};save();render(true);toast('Paramètres enregistrés');
};
A.csv=d=>{
  const text=csvOf(d.k);
  try{navigator.clipboard.writeText(text).then(()=>toast('CSV copié'),()=>{U.modal={t:'csv',text};render(true)})}catch(e){U.modal={t:'csv',text};render(true)}
};

/* ===== Événements ===== */
document.addEventListener('click',e=>{
  const el=e.target.closest('[data-a]');if(!el)return;
  if(['INPUT','SELECT','TEXTAREA','FORM'].includes(el.tagName))return;
  const f=A[el.dataset.a];if(f){f(el.dataset,el,e)}
});
document.addEventListener('change',e=>{
  const el=e.target;
  if(el.dataset.a&&(el.tagName==='INPUT')){const f=A[el.dataset.a];if(f)f(el.dataset,el,e);return}
  if(el.dataset.bind){
    let v=el.type==='checkbox'?el.checked:el.value;
    if(el.type==='number'||el.dataset.num!==undefined)v=(v===''?'':Number(v));
    setPath(el.dataset.bind,v);
    if(el.dataset.reset){U.sel.start=null;U.sel.end=null}
    if(el.dataset.render!==undefined||el.type==='checkbox'&&el.dataset.bind.startsWith('edit.hrs'))render(true);
  }
});
document.addEventListener('input',e=>{
  const el=e.target;if(!el.dataset.bind||el.type==='checkbox'||el.tagName==='SELECT'||el.type==='date')return;
  let v=el.value;if(el.type==='number'||el.dataset.num!==undefined)v=(v===''?'':Number(v));
  setPath(el.dataset.bind,v);
  if(el.dataset.bind==='co.siret'){const m=$('#siret-msg');if(m)m.textContent=sirenOk(v)?'Établissement actif trouvé dans l\'annuaire des entreprises (contrôle simulé).':''}
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&U.modal){A.closeModal()}});

/* ===== Démarrage ===== */
(function boot(){
  load();
  const h=(location.hash||'').replace('#','');
  const map={locataire:['renter','account'],bailleur:['host','host'],admin:['admin','admin'],recherche:['visitor','search'],accueil:['visitor','home']};
  if(map[h]){S.role=map[h][0];U.route=map[h][1]}
  else if(S.role==='renter')U.route='account';else if(S.role==='host')U.route='host';else if(S.role==='admin')U.route='admin';
  render();
})();
