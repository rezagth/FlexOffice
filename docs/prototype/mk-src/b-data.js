'use strict';
/* ===== Utilitaires ===== */
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const eur=n=>(Math.round(n*100)/100).toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
const pad=n=>String(n).padStart(2,'0');
const hm=m=>pad(Math.floor(m/60))+'h'+(m%60?pad(m%60):'');
const dkey=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
const TODAY=new Date();TODAY.setHours(0,0,0,0);
const NOW=()=>Date.now();
const DAYS=['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
const DAYS3=['dim.','lun.','mar.','mer.','jeu.','ven.','sam.'];
const fdate=k=>{const d=new Date(k+'T00:00');return DAYS[d.getDay()]+' '+d.getDate()+'/'+pad(d.getMonth()+1)};
const tsOf=(date,min)=>new Date(date+'T00:00').getTime()+min*60000;
const dur=m=>{const h=Math.floor(m/60),r=m%60;return h+' h'+(r?' '+r:'')};

/* ===== Référentiels ===== */
const TYPES={MEETING:'Salle de réunion',DESK:'Bureau',TRAINING:'Espace de formation',POPUP:'Boutique éphémère',STUDIO:'Studio / shooting',RDV:'Rendez-vous pro'};
const TYPE_HINT={MEETING:'Réunions, comités, ateliers',DESK:'Poste ou bureau fermé',TRAINING:'Formations, séminaires',POPUP:'Vente, showroom, lancement',STUDIO:'Photo, vidéo, tournage',RDV:'Clients, avocats, recrutement'};
const EQUIP=['Wifi','Parking','Vidéoprojecteur','Écran','Imprimante','Cuisine','Climatisation','Accès PMR','Café','Cabine téléphonique','Tableau blanc','Vitrine sur rue','Électricité renforcée','Point d\'eau','Fond photo'];
const POLICY={flex:{name:'Flexible',free:24,txt:'Remboursé jusqu\'à 24 h avant, puis 50 %'},moderate:{name:'Modérée',free:48,txt:'Remboursé jusqu\'à 48 h avant, puis 50 %'},firm:{name:'Ferme',free:168,txt:'Remboursé jusqu\'à 7 jours avant, puis 50 %'}};
const H=(o,c,sat,sun)=>({1:[o,c],2:[o,c],3:[o,c],4:[o,c],5:[o,c],6:sat?[o,sat]:null,0:sun?[o,sun]:null});
const m=h=>h*60;

/* ===== Données d'exemple ===== */
function seed(){
  const spaces=[
   {id:'bureau-flex-paris',title:'Bureau individuel Flex',type:'DESK',city:'Paris',zone:'Paris 4e',addr:'12 rue de Rivoli, 75004 Paris',pos:[.52,.28],cap:2,erp:{t:'W',c:5},surface:12,desc:'Bureau calme pour un rendez-vous client ou une journée concentrée.',equip:['Wifi','Imprimante'],hours:H(m(9),m(18),m(23),null),step:60,hourly:12,half:40,day:70,min:1,buffer:0,notice:2,instant:false,vat:true,deposit:100,cancel:'moderate',rules:['Pas de vente de produits','Pas d\'événement avec alcool'],owner:'Atelier Partners',status:'published',rating:0,nrev:0},
   {id:'salle-rivoli',title:'Salle de réunion Rivoli',type:'MEETING',city:'Paris',zone:'Paris 4e',addr:'12 rue de Rivoli, 75004 Paris',pos:[.53,.29],cap:8,erp:{t:'L',c:5},surface:28,desc:'Salle lumineuse pour 8 personnes, écran et tableau blanc. Idéale pour un comité ou un atelier de travail.',equip:['Wifi','Écran','Tableau blanc','Climatisation','Café'],hours:H(m(8),m(19),null,null),step:30,hourly:45,half:120,day:200,min:1,buffer:30,notice:4,instant:false,vat:true,deposit:150,cancel:'moderate',rules:['Pas d\'alcool','Remettre la salle en ordre'],owner:'Atelier Partners',status:'published',rating:4.7,nrev:6},
   {id:'boutique-marais',title:'Boutique éphémère Haut-Marais',type:'POPUP',city:'Paris',zone:'Paris 3e',addr:'18 rue de Turenne, 75003 Paris',pos:[.54,.27],cap:19,erp:{t:'M',c:5},surface:42,desc:'Boutique avec grande vitrine sur rue, électricité renforcée et accès de plain-pied. Pour un lancement, une vente privée ou un showroom.',equip:['Wifi','Vitrine sur rue','Électricité renforcée','Climatisation','Accès PMR'],hours:H(m(10),m(20),m(20),m(19)),step:60,hourly:40,half:130,day:240,min:4,buffer:60,notice:24,instant:false,vat:true,deposit:300,cancel:'firm',rules:['Vente de produits autorisée (activité déclarée par le locataire)','Alcool interdit','Affichage vitrine autorisé, sans percer'],owner:'Atelier Partners',status:'published',rating:0,nrev:0},
   {id:'studio-bastille',title:'Studio photo Bastille',type:'STUDIO',city:'Paris',zone:'Paris 11e',addr:'7 rue de la Roquette, 75011 Paris',pos:[.55,.3],cap:12,erp:{t:'W',c:5},surface:55,desc:'Studio de 55 m² avec cyclo blanc, fonds de couleur et point d\'eau. Lumière du jour au nord.',equip:['Wifi','Fond photo','Électricité renforcée','Point d\'eau'],hours:H(m(8),m(22),m(22),m(22)),step:30,hourly:60,half:200,day:380,min:2,buffer:30,notice:12,instant:false,vat:true,deposit:400,cancel:'moderate',rules:['Matériel du studio non déplaçable','Peinture et colle interdites'],owner:'Studio Bastille SAS',status:'published',rating:4.9,nrev:14},
   {id:'formation-lyon',title:'Salle de formation Part-Dieu',type:'TRAINING',city:'Lyon',zone:'Lyon 3e',addr:'45 rue de la Villette, 69003 Lyon',pos:[.62,.62],cap:20,erp:{t:'R',c:5},surface:48,desc:'Salle modulable pour 20 stagiaires, vidéoprojecteur, paperboard et pause café sur demande.',equip:['Wifi','Vidéoprojecteur','Tableau blanc','Climatisation','Café','Accès PMR'],hours:H(m(8),m(19),null,null),step:30,hourly:50,half:170,day:300,min:2,buffer:30,notice:4,instant:true,vat:true,deposit:200,cancel:'flex',rules:['Pas de cuisson sur place'],owner:'Part-Dieu Workplaces',status:'published',rating:4.5,nrev:9},
   {id:'rdv-bordeaux',title:'Cabinet rendez-vous Chartrons',type:'RDV',city:'Bordeaux',zone:'Bordeaux Chartrons',addr:'22 cours Balguerie-Stuttenberg, 33300 Bordeaux',pos:[.3,.7],cap:4,erp:{t:'W',c:5},surface:16,desc:'Petit cabinet insonorisé pour recevoir un client, un candidat ou un patient dans un cadre sobre.',equip:['Wifi','Cabine téléphonique','Café'],hours:H(m(8),m(20),m(18),null),step:30,hourly:22,half:70,day:120,min:1,buffer:0,notice:1,instant:true,vat:false,deposit:0,cancel:'flex',rules:['Pas de consultation médicale sans accord écrit de l\'hôte'],owner:'Cabinet Chartrons',status:'published',rating:4.8,nrev:21},
   {id:'reunion-wacken',title:'Salle de réunion Wacken',type:'MEETING',city:'Strasbourg',zone:'Strasbourg Wacken',addr:'3 rue Erckmann-Chatrian, 67000 Strasbourg',pos:[.82,.25],cap:10,erp:{t:'L',c:5},surface:30,desc:'Salle proche du Parlement européen, parking à proximité, écran 75 pouces.',equip:['Wifi','Écran','Vidéoprojecteur','Parking','Accès PMR'],hours:H(m(8),m(19),null,null),step:30,hourly:38,half:120,day:210,min:1,buffer:30,notice:4,instant:false,vat:true,deposit:150,cancel:'moderate',rules:['Pas d\'alcool'],owner:'Rieth Immobilier',status:'published',rating:4.6,nrev:5},
   {id:'showroom-gare',title:'Showroom Gare de Strasbourg',type:'POPUP',city:'Strasbourg',zone:'Strasbourg Gare',addr:'15 rue du Rieth, 67000 Strasbourg',pos:[.83,.27],cap:29,erp:{t:'M',c:5},surface:60,desc:'Local commercial de 60 m² avec deux vitrines, à 3 minutes de la gare. Pour boutique éphémère ou présentation produit.',equip:['Wifi','Vitrine sur rue','Électricité renforcée','Accès PMR'],hours:H(m(10),m(19),m(19),null),step:60,hourly:35,half:120,day:210,min:4,buffer:60,notice:24,instant:false,vat:true,deposit:300,cancel:'firm',rules:['Vente autorisée','Alcool interdit'],owner:'Rieth Immobilier',status:'review',rating:0,nrev:0}
  ];
  const d=n=>dkey(addDays(TODAY,n));
  const res=[
   {id:'R-1042',spaceId:'bureau-flex-paris',date:d(1),start:m(10),end:m(13),people:2,usage:'Rendez-vous client',status:'confirmée',created:NOW()-86400000*3,signed:'Camille Martin',rc:true,code:'482615',renter:'Camille Martin',company:'Studio Lumen',siret:'81234567800019',checkin:[],checkout:[],reviewed:false},
   {id:'R-1043',spaceId:'salle-rivoli',date:d(1),start:m(14),end:m(17),people:6,usage:'Atelier d\'équipe',status:'demande',created:NOW()-3600000*2,signed:'Camille Martin',rc:true,code:'',renter:'Camille Martin',company:'Studio Lumen',siret:'81234567800019',checkin:[],checkout:[],reviewed:false},
   {id:'R-1044',spaceId:'boutique-marais',date:d(4),start:m(10),end:m(18),people:15,usage:'Vente privée',status:'acceptée',created:NOW()-86400000,signed:'Camille Martin',rc:true,code:'730194',renter:'Camille Martin',company:'Studio Lumen',siret:'81234567800019',checkin:[],checkout:[],reviewed:false},
   {id:'R-1038',spaceId:'salle-rivoli',date:d(-6),start:m(9),end:m(12),people:5,usage:'Comité de pilotage',status:'terminée',created:NOW()-86400000*12,signed:'Camille Martin',rc:true,code:'115908',renter:'Camille Martin',company:'Studio Lumen',siret:'81234567800019',checkin:[],checkout:[],reviewed:false},
   {id:'R-1031',spaceId:'bureau-flex-paris',date:d(-12),start:m(9),end:m(18),people:1,usage:'Journée de travail',status:'terminée',created:NOW()-86400000*20,signed:'Camille Martin',rc:true,code:'904417',renter:'Camille Martin',company:'Studio Lumen',siret:'81234567800019',checkin:[],checkout:[],reviewed:true},
   {id:'R-1045',spaceId:'studio-bastille',date:d(1),start:m(9),end:m(12),people:4,usage:'Shooting catalogue',status:'demande',created:NOW()-3600000*5,signed:'Léa Garnier',rc:true,code:'',renter:'Léa Garnier',company:'Atelier Garnier',siret:'90210987600023',checkin:[],checkout:[],reviewed:false},
   {id:'R-1046',spaceId:'salle-rivoli',date:d(3),start:m(9),end:m(11),people:4,usage:'Entretien de recrutement',status:'demande',created:NOW()-3600000*20,signed:'Karim Benali',rc:true,code:'',renter:'Karim Benali',company:'Benali Conseil',siret:'45678912300045',checkin:[],checkout:[],reviewed:false}
  ];
  res.forEach(r=>{const s=spaces.find(x=>x.id===r.spaceId);Object.assign(r,quote(s,r.end-r.start,{fee:6,tva:20}));});
  return {
    role:'visitor',
    settings:{commission:12,fee:6,tva:20},
    spaces,res,
    blocks:{'bureau-flex-paris':[{date:d(((6-TODAY.getDay())+7)%7||7),start:m(18),end:m(20)}]},
    external:{'salle-rivoli':[{date:d(2),start:m(9),end:m(10.5),label:'Google Agenda : visite syndic'}]},
    msgs:{'R-1042':[{from:'renter',text:'Bonjour, nous serons deux. Y a-t-il une imprimante ?',ts:NOW()-86400000*2},{from:'host',text:'Oui, wifi et imprimante sont inclus. Le code d\'accès sera actif 15 minutes avant.',ts:NOW()-86400000*2+3600000}],'R-1043':[{from:'renter',text:'Pouvez-vous prévoir le paperboard ?',ts:NOW()-3600000}]},
    reviews:[{sp:'salle-rivoli',who:'Hugo L.',stars:5,txt:'Salle propre, écran fiable, accueil réactif.',date:d(-30)},{sp:'salle-rivoli',who:'Inès R.',stars:4,txt:'Très bien situé. Le chauffage met un peu de temps à monter.',date:d(-52)},{sp:'studio-bastille',who:'Atelier Nord',stars:5,txt:'Cyclo impeccable, lumière du jour superbe.',date:d(-18)},{sp:'formation-lyon',who:'Formations Sud',stars:5,txt:'Parfait pour 18 stagiaires. Réservation immédiate pratique.',date:d(-9)},{sp:'rdv-bordeaux',who:'Cabinet Lagrange',stars:5,txt:'Discret et calme.',date:d(-4)}],
    verifs:[
      {id:'V-1',company:'Part-Dieu Workplaces',siret:'83212345600017',kind:'Hôte',docs:{kbis:true,rc:true,sublease:true,iban:true},status:'attente',note:''},
      {id:'V-2',company:'Cabinet Chartrons',siret:'79845612300031',kind:'Hôte',docs:{kbis:true,rc:false,sublease:true,iban:true},status:'attente',note:''},
      {id:'V-3',company:'Benali Conseil',siret:'45678912300045',kind:'Locataire',docs:{kbis:true,rc:true,sublease:null,iban:null},status:'attente',note:''},
      {id:'V-4',company:'Studio Bastille SAS',siret:'88123456700012',kind:'Hôte',docs:{kbis:true,rc:true,sublease:true,iban:true},status:'validé',note:''}
    ],
    listingsReview:[{id:'showroom-gare',checks:{photos:false,jauge:true,erp:true,regles:true}}],
    disputes:[{id:'L-12',res:'R-1038',title:'Rayure sur la table de réunion signalée par l\'hôte',amount:80,status:'ouvert',note:''},{id:'L-9',res:'R-1031',title:'Code d\'accès non reçu à l\'arrivée',amount:0,status:'résolu',note:'Code renvoyé par SMS, accès rétabli en 6 minutes.'}],
    hostTasks:{photos:false,hours:true,rates:true,erp:true,rc:true,sublease:false,iban:true,kyb:true},
    sync:{google:true}
  };
}

/* ===== Moteur de réservation à l'heure ===== */
let S=seed();
const sp=id=>S.spaces.find(s=>s.id===id);
function intervals(spaceId,date){
  const s=sp(spaceId),out=[];
  S.res.filter(r=>r.spaceId===spaceId&&r.date===date&&['demande','acceptée','confirmée'].includes(r.status)).forEach(r=>out.push({a:r.start,b:r.end,buf:s.buffer,kind:'res',r}));
  (S.blocks[spaceId]||[]).filter(b=>b.date===date).forEach(b=>out.push({a:b.start,b:b.end,buf:0,kind:'block',b}));
  if(S.sync.google)(S.external[spaceId]||[]).filter(b=>b.date===date).forEach(b=>out.push({a:b.start,b:b.end,buf:0,kind:'ext',b}));
  return out;
}
function cells(spaceId,date){
  const s=sp(spaceId),d=new Date(date+'T00:00'),h=s.hours[d.getDay()];
  if(!h)return null;
  const iv=intervals(spaceId,date),out=[];
  for(let t=h[0];t<h[1];t+=s.step){
    let free=true,why='';
    if(tsOf(date,t)<NOW()+s.notice*3600000){free=false;why='Préavis'}
    for(const i of iv){
      if(t<i.b+i.buf&&t+s.step+i.buf>i.a){free=false;why=(t<i.b&&t+s.step>i.a)?(i.kind==='res'?'Réservé':i.kind==='block'?'Bloqué':'Agenda externe'):'Remise en état'}
    }
    out.push({t,free,why});
  }
  return out;
}
function rangeOk(spaceId,date,start,end){
  const s=sp(spaceId),cs=cells(spaceId,date);
  if(!cs||end-start<s.min*60)return false;
  for(let t=start;t<end;t+=s.step){const c=cs.find(x=>x.t===t);if(!c||!c.free)return false}
  return true;
}
function quote(s,mins,over){
  const h=mins/60,cap=h<=4?s.half:s.half+(h-4)*s.hourly;
  const base=Math.min(h*s.hourly,cap,s.day);
  const ht=Math.round(base*100)/100;
  const feePct=over?over.fee:S.settings.fee,tvaPct=over?over.tva:S.settings.tva;
  const vat=s.vat?Math.round(ht*tvaPct)/100:0;
  const fee=Math.round(ht*feePct*1.2)/100;
  return {ht,vat,fee,total:Math.round((ht+vat+fee)*100)/100,deposit:s.deposit};
}
function startTs(r){return tsOf(r.date,r.start)}
function refundOf(r){
  const s=sp(r.spaceId),rent=r.ht+r.vat;
  if(r.status==='demande')return {rent,fee:r.fee,total:r.total,label:'Annulation gratuite avant acceptation : tout est remboursé.'};
  const hrs=(startTs(r)-NOW())/3600000,p=POLICY[s.cancel];
  if(hrs>=p.free)return {rent,fee:0,total:rent,label:'Plus de '+(p.free>=168?'7 jours':p.free+' h')+' avant le début : loyer remboursé, frais de service conservés.'};
  if(hrs>0)return {rent:rent/2,fee:0,total:rent/2,label:'Moins de '+(p.free>=168?'7 jours':p.free+' h')+' avant le début : 50 % du loyer remboursé.'};
  return {rent:0,fee:0,total:0,label:'Le créneau a commencé : aucun remboursement.'};
}
const nextId=()=>'R-'+(1047+S.res.length);
function mine(){return S.res.filter(r=>r.renter==='Camille Martin')}
function hostSpaces(){return S.spaces.filter(s=>s.owner==='Atelier Partners')}
function hostRes(){const ids=hostSpaces().map(s=>s.id);return S.res.filter(r=>ids.includes(r.spaceId))}
function netOf(r){return Math.round(r.ht*(100-S.settings.commission))/100}
function avgRating(id){const l=S.reviews.filter(x=>x.sp===id);return l.length?l.reduce((a,x)=>a+x.stars,0)/l.length:0}
function save(){try{localStorage.setItem('mk-proto-v1',JSON.stringify(S))}catch(e){}}
function load(){try{const j=localStorage.getItem('mk-proto-v1');if(j){const o=JSON.parse(j);if(o&&o.spaces&&o.res)S=o}}catch(e){}}
function sig(){try{return localStorage.getItem('mk-proto-v1')?true:false}catch(e){return false}}
