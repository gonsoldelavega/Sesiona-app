// Ejecutar con la zona horaria real del público objetivo (Canarias, UTC+0/+1).
// Con TZ UTC los bugs de fecha por toISOString() quedaban ocultos.
process.env.TZ = process.env.TZ || 'Atlantic/Canary';

const fs = require('fs');
const { JSDOM } = require('jsdom');
const path = require('path').resolve(__dirname, '..');

const html = fs.readFileSync(path + '/index.html', 'utf8');
// Extract body markup but we'll just build the DOM from the full file (scripts removed; we inject manually)
const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), {
  url: 'http://localhost/',
  pretendToBeVisual: true,
  runScripts: 'outside-only'
});
const { window } = dom;
global.window = window; global.document = window.document;
// Stub dialog methods (jsdom may not implement showModal)
window.HTMLDialogElement.prototype.showModal = function(){ this.open = true; };
window.HTMLDialogElement.prototype.close = function(){ this.open = false; };
window.print = function(){ window.__printed = true; };
window.alert = function(m){ window.__alert = m; };
window.confirm = function(){ return true; };
window.URL.createObjectURL = function(){ return 'blob:fake'; };

const combined = ['app.js','advisor.js','branding.js','invoice.js','photo-import.js']
  .map(f => fs.readFileSync(path + '/assets/js/' + f, 'utf8'))
  .join('\n;\n') + '\n;window.S=S;';
window.eval(combined);

const S = window.S;
let pass = 0, fail = 0;
function ok(name, cond){ if(cond){pass++; console.log('  ✓ '+name);} else {fail++; console.log('  ✗ FAIL: '+name);} }

console.log('\n== Estado inicial ==');
ok('S existe', !!S);
ok('render ejecutado (todayLine)', document.getElementById('todayLine').textContent.length>0);
ok('autoBillOn por defecto false (manual)', window.autoBillOn()===false);
S.set.autoBill=true; // habilitar auto para probar el camino automático en los siguientes bloques
ok('seeInvoice es el override profesional', /buildInvoiceHTML/.test(window.seeInvoice.toString()));
ok('photoImport definido', typeof window.photoImport==='function');

console.log('\n== Facturación: cliente normal => factura automática ==');
const c1 = {id:'c1', name:'Ana', sur:'García', nif:'12345678Z', phone:'600111222', price:60, irpf:0, type:'particular', igicReg:'exento', amigo:false};
S.clients.push(c1);
const s1 = {id:'s1', c:'c1', start:'2026-06-06T10:00', price:60, st:'programada', notes:'', inv:'', rem:false, noBill:false};
S.sessions.push(s1);
window.mark('s1','finalizada');
ok('cliente normal genera factura', !!s1.inv && S.invoices.length===1);

console.log('\n== Facturación: amigo => NO factura ==');
const c2 = {id:'c2', name:'Pepe', sur:'Amigo', nif:'', phone:'600333444', price:50, irpf:0, type:'particular', igicReg:'exento', amigo:true};
S.clients.push(c2);
const s2 = {id:'s2', c:'c2', start:'2026-06-06T11:00', price:50, st:'programada', notes:'', inv:'', rem:false, noBill:false};
S.sessions.push(s2);
const invBefore = S.invoices.length;
window.mark('s2','finalizada');
ok('amigo NO genera factura', !s2.inv && S.invoices.length===invBefore);
ok('billable(amigo)===false', window.billable(s2)===false);

console.log('\n== Facturación: cita marcada no facturar => NO factura ==');
const s3 = {id:'s3', c:'c1', start:'2026-06-06T12:00', price:60, st:'programada', notes:'', inv:'', rem:false, noBill:true};
S.sessions.push(s3);
const invBefore3 = S.invoices.length;
window.mark('s3','finalizada');
ok('noBill NO genera factura', !s3.inv && S.invoices.length===invBefore3);

console.log('\n== Modo manual global ==');
S.set.autoBill=false;
const s4 = {id:'s4', c:'c1', start:'2026-06-06T13:00', price:60, st:'programada', notes:'', inv:'', rem:false, noBill:false};
S.sessions.push(s4);
const invBefore4=S.invoices.length;
window.mark('s4','finalizada');
ok('modo manual: no factura automática', !s4.inv && S.invoices.length===invBefore4);
S.set.autoBill=true;

console.log('\n== Plantilla de factura ==');
S.set.fiscal='Consulta Demo Test';
window.seeInvoice(S.invoices[0].id);
const modalHtml = document.getElementById('modal').innerHTML;
ok('factura: contiene invoiceDoc', /invoiceDoc/.test(modalHtml));
ok('factura: tabla de conceptos', /invTable/.test(modalHtml));
ok('factura: total y emisor', /TOTAL/.test(modalHtml) && /Consulta Demo Test/.test(modalHtml));
ok('factura: botón imprimir', /print\(\)/.test(modalHtml));

console.log('\n== Importar por foto (OCR) ==');
window.photoImport();
const m2 = document.getElementById('modal').innerHTML;
ok('foto: pantalla de captura', /Importar agenda desde foto/.test(m2) && /piFile/.test(m2));

console.log('\n== WhatsApp: recordatorio con confirmación ==');
S.set.phone='600999888';
const reminder = window.msgCita(s1);
ok('recordatorio pide confirmar asistencia', /confírmame tu asistencia/i.test(reminder));
ok('recordatorio incluye enlace Sí', /Sí, asistiré: https:\/\/wa\.me\//.test(reminder) && /CONFIRMO/.test(reminder));
ok('recordatorio incluye opción No', /No puedo asistir: https:\/\/wa\.me\//.test(reminder));
S.set.phone='';
const reminder2 = window.msgCita(s1);
ok('sin teléfono propio: fallback responder SÍ/NO', /responde \*?SÍ/i.test(reminder2));

console.log('\n== WhatsApp: factura con PDF ==');
ok('sendInvoice es el override con PDF', /makeInvoicePdfFile|__invShare|outputPdf/.test(window.sendInvoice.toString()));
window.sendInvoice(S.invoices[0].id);
const m3 = document.getElementById('modal').innerHTML;
ok('factura: pantalla de envío/preparación PDF', /Enviar factura/.test(m3) && /PDF/.test(m3));

console.log('\n== Agenda: próxima cita y agrupación por día ==');
// Limpiar sesiones y crear citas: una hoy futura y una pasada (orden sin sentido)
S.sessions.length=0;
function ymdLocal(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function iso(daysFromNow, hhmm){const d=new Date(Date.now()+daysFromNow*86400000);return ymdLocal(d)+'T'+hhmm;}
S.sessions.push({id:'sa',c:'c1',start:iso(0,'23:30'),price:60,st:'programada',inv:'',rem:false,noBill:false}); // hoy tarde-noche (futura)
S.sessions.push({id:'sb',c:'c1',start:iso(3,'10:00'),price:60,st:'programada',inv:'',rem:false,noBill:false}); // dentro de 3 días
window.F='next';
window.AV='list';
window.go('agenda');
const ag = document.getElementById('screen').innerHTML;
ok('agenda muestra "Próxima cita"', /Próxima cita/.test(ag));
ok('agenda agrupa por día (cabecera Hoy)', /Hoy ·/.test(ag));
ok('cita de hoy aparece en Próximas', /sa|23:30/.test(ag) && /23:30/.test(ag));
ok('chips Próximas/Semana/Mes/Todas', /Semana/.test(ag) && /Mes/.test(ag) && /Todas/.test(ag));

console.log('\n== Agenda: vista calendario (3 días) ==');
window.AV='cal';
window.go('agenda');
const agCal = document.getElementById('screen').innerHTML;
ok('agenda calendario muestra "Próxima cita"', /Próxima cita/.test(agCal));
ok('agenda calendario contiene .calGrid', /calGrid/.test(agCal));
ok('agenda calendario muestra cabeceras de día', /calColHead/.test(agCal));
ok('window.agendaCal definido', typeof window.agendaCal==='function');
ok('window.newSessionAt definido', typeof window.newSessionAt==='function');

console.log('\n== Crear cita: default mañana 16:00 ==');
window.sessionForm();
const sf = document.getElementById('modal').innerHTML;
const tomorrow = ymdLocal(new Date(Date.now()+86400000));
ok('fecha por defecto = mañana', sf.indexOf('value="'+tomorrow+'"')>-1);
ok('hora por defecto = 16', /<option value="16" selected(?:="")?>/.test(sf));

console.log('\n== Guardar cita NO factura; solo al confirmar asistencia ==');
window.sessionForm();
document.getElementById('sc').value='c1';
document.getElementById('sdate').value=tomorrow;
document.getElementById('shour').value='16';
document.getElementById('smin').value='00';
document.getElementById('sprice').value='60';
document.getElementById('sst').value='finalizada';
document.getElementById('sbill').value='0';
const invCountBefore=S.invoices.length;
window.saveSession('');
const newSess=S.sessions[S.sessions.length-1];
ok('guardar cita (incluso finalizada) NO crea factura', S.invoices.length===invCountBefore && !newSess.inv);
window.mark(newSess.id,'finalizada');
ok('marcar Finalizada desde la agenda SÍ crea factura', S.invoices.length===invCountBefore+1 && !!newSess.inv);

console.log('\n== Sprint 2: bugs visibles ==');
window.AV='list';
window.go('agenda');
const ag2 = document.getElementById('screen').innerHTML;
ok('chip "Sin facturar" en agenda', /Sin facturar/.test(ag2));
ok('hero Avisos navega a alerts', /onclick="go\('alerts'\)"/.test(ag2));
window.go('more');
ok('Más incluye acceso a Avisos', /go\('alerts'\)/.test(document.getElementById('screen').innerHTML));
window.sessionForm();
const sf2 = document.getElementById('modal').innerHTML;
ok('formulario permite hora 00 y 23', /value="00"/.test(sf2) && /value="23"/.test(sf2));
ok('demoSeed y seed definidos', typeof window.demoSeed==='function' && typeof window.seed==='function');

console.log('\n== Sprint 3: robustez ==');
ok('esc escapa comillas, & y <', window.esc("O'Brien & <b>") === 'O&#39;Brien &amp; &lt;b&gt;');

ok('window.waClient existe', typeof window.waClient === 'function');

console.log('\n== Sprint 3: numeración de facturas correlativa por año ==');
const year = new Date().getFullYear();
window.invoiceForm();
document.getElementById('ic').value = 'c1';
document.getElementById('concept').value = 'Sesión 1';
document.getElementById('qty').value = '1';
document.getElementById('unit').value = '60';
window.saveInvoiceManual();
const invA = S.invoices[S.invoices.length - 1];

window.invoiceForm();
document.getElementById('ic').value = 'c1';
document.getElementById('concept').value = 'Sesión 2';
document.getElementById('qty').value = '1';
document.getElementById('unit').value = '60';
window.saveInvoiceManual();
const invB = S.invoices[S.invoices.length - 1];

const reYear = new RegExp('-(\\d{3})\\/' + year + '$');
const mA = invA.num.match(reYear);
const mB = invB.num.match(reYear);
ok('factura A tiene formato -NNN/AAAA del año actual', !!mA);
ok('factura B tiene formato -NNN/AAAA del año actual', !!mB);
ok('dos facturas del mismo año llevan números correlativos', !!mA && !!mB && (Number(mB[1]) === Number(mA[1]) + 1));

console.log('\n== Facturación manual con botón "Crear factura" ==');
S.set.autoBill=false;
const sM={id:'sM',c:'c1',start:'2026-06-06T15:00',price:60,st:'programada',inv:'',rem:false,noBill:false};
S.sessions.push(sM);
const invM=S.invoices.length;
window.mark('sM','finalizada');
ok('manual: marcar finalizada NO crea factura', S.invoices.length===invM && !sM.inv);
window.invoiceSession('sM');
ok('manual: "Crear factura" (invoiceSession) sí la crea', S.invoices.length===invM+1 && !!sM.inv);
window.AV='list'; window.go('agenda');
ok('tarjeta de cita muestra botón "Crear factura"', /Crear factura/.test(document.getElementById('screen').innerHTML));
S.set.autoBill=true;

console.log('\n== Sprint 5: asistente de primera configuración ==');
ok('window.setupWizard definido', typeof window.setupWizard==='function');
window.setupWizard();
const wizHtml = document.getElementById('modal').innerHTML;
ok('asistente: incluye campo obnif', /id="obnif"/.test(wizHtml));
ok('asistente: incluye campo obpro', /id="obpro"/.test(wizHtml));
ok('window.saveWizard definido', typeof window.saveWizard==='function');

console.log('\n== Fechas locales (bug TZ Canarias/verano) ==');
ok('window.ymd definido', typeof window.ymd==='function');
ok('ymd() devuelve la fecha LOCAL (base de today/addDays)', window.ymd(new Date())===ymdLocal(new Date()));
ok('shiftCGfrom(base,0) no retrocede un día', window.shiftCGfrom('2026-07-15',0)==='2026-07-15');
ok('shiftCGfrom(base,1) avanza exactamente un día', window.shiftCGfrom('2026-07-15',1)==='2026-07-16');
window.CG='2026-07-15';
const cgFwd = window.shiftCG(3);
window.CG=cgFwd;
ok('shiftCG ida y vuelta es simétrico', (window.CG=window.shiftCG(-3), window.CG)==='2026-07-15');
window.CG=window.ymd(new Date());

console.log('\n== Panel: "Pendiente" excluye facturas anuladas ==');
const invPend = S.invoices.find(i => window.bal(i) > 0) || S.invoices[0];
const pendConInv = window.metrics().pend;
invPend.st = 'anulada';
const pendSinInv = window.metrics().pend;
ok('anular una factura reduce el Pendiente del panel', pendSinInv < pendConInv || (pendConInv===0 && pendSinInv===0));

console.log('\n== Facturas anuladas en listas ==');
window.go('invoices');
const invListHtml = document.getElementById('screen').innerHTML;
ok('la factura anulada no muestra botón Cobrar', !new RegExp('payForm\\(\''+invPend.id+'\'\\)').test(invListHtml));
window.payForm();
const payHtml = document.getElementById('modal').innerHTML;
ok('payForm no ofrece facturas anuladas', payHtml.indexOf(invPend.id)===-1);

console.log('\n== Escapado en selects de cliente ==');
S.clients.push({id:'cx', name:'<b>Mal</b>', sur:"O'Brien", nif:'', phone:'', price:60, irpf:0, type:'particular', igicReg:'exento', amigo:false});
window.sessionForm();
const sfx = document.getElementById('modal').innerHTML;
ok('sessionForm escapa el nombre del cliente', sfx.indexOf('&lt;b&gt;Mal&lt;/b&gt;')>-1 && sfx.indexOf('<b>Mal</b>')===-1);
window.invoiceForm();
const ifx = document.getElementById('modal').innerHTML;
ok('invoiceForm escapa el nombre del cliente', ifx.indexOf('&lt;b&gt;Mal&lt;/b&gt;')>-1);
S.clients.pop();

console.log('\n== Facturar a un amigo pide confirmación ==');
const sAmigo={id:'sAmigo', c:'c2', start:'2026-06-07T10:00', price:50, st:'finalizada', inv:'', rem:false, noBill:false};
S.sessions.push(sAmigo);
const invAmigoBefore=S.invoices.length;
window.confirm=function(){ window.__confirmMsg=arguments[0]; return false; };
window.invoiceSession('sAmigo');
ok('con confirmación rechazada NO se factura al amigo', S.invoices.length===invAmigoBefore && !sAmigo.inv);
ok('el mensaje avisa de que es amigo/sin factura', /amigo/i.test(window.__confirmMsg||''));
window.confirm=function(){ return true; };
window.invoiceSession('sAmigo');
ok('con confirmación aceptada SÍ se factura', S.invoices.length===invAmigoBefore+1 && !!sAmigo.inv);

console.log('\n== Cabecera con nombre profesional ==');
ok('window.updateBrand definido', typeof window.updateBrand==='function');
S.set.pro='Consulta Vega';
window.render();
ok('la cabecera muestra el nombre en cada render', /CONSULTA VEGA/.test(document.querySelector('.brand').innerHTML));

console.log('\n== Calendario: citas fuera de la rejilla 8-21 siguen visibles ==');
S.sessions.push({id:'sLate', c:'c1', start:window.ymd(new Date())+'T23:00', price:60, st:'programada', inv:'', rem:false, noBill:false});
window.AV='cal'; window.CG=window.ymd(new Date()); window.go('agenda');
const calHtml = document.getElementById('screen').innerHTML;
ok('la cita de las 23:00 aparece en el calendario', /23:00/.test(calHtml));
ok('la cita de las 23:00 no queda en top:100%', !/top:100%/.test(calHtml));

console.log('\n== Gastos: editar y borrar ==');
window.expenseForm();
document.getElementById('eprov').value='Gestoría Test';
document.getElementById('edate').value='2026-06-01';
document.getElementById('etotal').value='50';
document.getElementById('eigic').value='3';
window.saveExpense('');
const exp1=S.expenses[S.expenses.length-1];
ok('gasto creado', exp1.prov==='Gestoría Test' && exp1.total===50);
window.expenseForm(exp1.id);
document.getElementById('etotal').value='75';
window.saveExpense(exp1.id);
ok('gasto editado (total actualizado)', exp1.total===75 && S.expenses[S.expenses.length-1].id===exp1.id);
const expCount=S.expenses.length;
window.delExpense(exp1.id);
ok('gasto borrado con confirmación', S.expenses.length===expCount-1);
window.go('expenses');
const expHtml=document.getElementById('screen').innerHTML;
ok('la lista de gastos ofrece Editar/Borrar', /expenseForm\(/.test(expHtml) || /Sin gastos/.test(expHtml));

console.log('\n== Copia de seguridad ==');
ok('el archivo de copia se llama sesiona-copia-<fecha>.json', /sesiona-copia-/.test(window.exportData.toString()));
ok('clearAll limpia también la clave antigua ccc', /removeItem\("ccc"\)/.test(window.clearAll.toString()));

console.log('\n== Foto agenda: entrada manual accesible ==');
window.photoImport();
const piHtml = document.getElementById('modal').innerHTML;
ok('pantalla de foto ofrece "Introducir citas a mano"', /Introducir citas a mano/.test(piHtml));

console.log('\n== Aviso del formulario coherente con el modo de facturación ==');
S.set.autoBill=false;
window.sessionForm();
ok('modo manual: el aviso no promete factura automática', /modo manual/.test(document.getElementById('modal').innerHTML));
S.set.autoBill=true;
window.sessionForm();
ok('modo auto: el aviso explica la factura al confirmar asistencia', /confirmas la asistencia/.test(document.getElementById('modal').innerHTML));

console.log('\n== Importar copia de seguridad ==');
ok('window.importData y applyImport definidos', typeof window.importData==='function' && typeof window.applyImport==='function');
window.go('settings');
ok('Ajustes ofrece botón "Importar copia"', /Importar copia/.test(document.getElementById('screen').innerHTML));
window.__alert='';
ok('applyImport rechaza un archivo que no es copia', window.applyImport({foo:1})===false && /no parece una copia/.test(window.__alert));
const ccv9Backup = window.localStorage.ccv9;
const fakeBackup = {set:{pro:'Restaurada'}, clients:[], sessions:[], invoices:[], payments:[], expenses:[]};
ok('applyImport acepta una copia válida y la persiste', window.applyImport(fakeBackup)===true && JSON.parse(window.localStorage.ccv9).set.pro==='Restaurada');
window.localStorage.ccv9 = ccv9Backup; // restaurar estado para el resto de tests

console.log('\n== Eliminar citas ==');
window.sessionForm(null,'sM');
ok('el formulario de edición de cita ofrece Eliminar', /delSession\('sM'\)/.test(document.getElementById('modal').innerHTML));
const invTotalBefore = S.invoices.length;
window.delSession('sM');
ok('la cita se elimina', !S.sessions.find(s=>s.id==='sM'));
ok('su factura se conserva', S.invoices.length===invTotalBefore);

console.log('\n== Eliminar clientes ==');
window.clientForm('c1');
ok('el formulario de edición de cliente ofrece Eliminar', /delClient\('c1'\)/.test(document.getElementById('modal').innerHTML));
window.__alert='';
window.delClient('c1');
ok('cliente con facturas NO se puede borrar', !!window.S.clients.find(c=>c.id==='c1') && /facturas emitidas/.test(window.__alert));
S.clients.push({id:'c3', name:'Temporal', sur:'', nif:'', phone:'', price:60, irpf:0, type:'particular', igicReg:'exento', amigo:false});
S.sessions.push({id:'s3del', c:'c3', start:'2026-08-01T10:00', price:60, st:'programada', inv:'', rem:false, noBill:false});
window.delClient('c3');
ok('cliente sin facturas se borra junto a sus citas', !S.clients.find(c=>c.id==='c3') && !S.sessions.find(s=>s.id==='s3del'));

console.log('\n== Cobros: listar y borrar ==');
const invPay = S.invoices.find(i=>i.st!=='anulada');
S.payments.push({id:'pDel', inv:invPay.id, date:'2026-07-01', amount:10, method:'bizum'});
window.payForm(invPay.id);
const payHtml2 = document.getElementById('modal').innerHTML;
ok('registrar cobro lista los cobros existentes', /Cobros ya registrados/.test(payHtml2) && /delPayment\('pDel'\)/.test(document.getElementById('payList').innerHTML));
window.delPayment('pDel');
ok('el cobro se borra con confirmación', !S.payments.find(p=>p.id==='pDel'));

console.log('\n== Calendario: rejilla dinámica ==');
window.AV='cal'; window.CG=window.ymd(new Date()); window.go('agenda');
const calHtml2 = document.getElementById('screen').innerHTML;
ok('con citas a las 23:00-23:30 la rejilla se amplía (etiqueta 23:00)', /calHourLabel[^>]*>23:00/.test(calHtml2));
ok('la rejilla mantiene el inicio a las 08:00', /calHourLabel[^>]*>08:00/.test(calHtml2));

console.log('\n== Factura con IGIC "revisar": aviso visible ==');
S.invoices.push({id:'iRev', c:'c1', num:'T-999/2026', date:'2026-07-01', due:'2026-07-31', concept:'Prueba', base:60, igic:0, irpf:0, total:60, st:'emitida', reg:'revisar'});
window.seeInvoice('iRev');
ok('la factura avisa del régimen pendiente de revisar', /pendiente de revisar/.test(document.getElementById('modal').innerHTML) && /sin IGIC/.test(document.getElementById('modal').innerHTML));
window.seeInvoice(S.invoices[0].id);
ok('las facturas normales no llevan el aviso', !/pendiente de revisar/.test(document.getElementById('modal').innerHTML));

console.log('\n== Vendorización y service worker ==');
const invoiceSrc = fs.readFileSync(path + '/assets/js/invoice.js', 'utf8');
ok('el PDF carga primero la copia local vendorizada', /\/assets\/vendor\/html2pdf\.bundle\.min\.js/.test(invoiceSrc));
ok('la copia vendorizada existe en el repo', fs.existsSync(path + '/assets/vendor/html2pdf.bundle.min.js'));
const swSrc = fs.readFileSync(path + '/sw.js', 'utf8');
ok('sw.js versiona el cache (sesiona-v2)', /sesiona-v2/.test(swSrc));
ok('sw.js precachea el vendor', /assets\/vendor\/html2pdf\.bundle\.min\.js/.test(swSrc));
ok('sw.js usa network-first para JS/CSS propios', /destination === 'script' \|\| request\.destination === 'style'/.test(swSrc));
ok('sw.js cachea los CDN de OCR/PDF para uso offline', /tessdata\.projectnaptha\.com/.test(swSrc) && /CDN_CACHE/.test(swSrc));

console.log('\n== Resumen ==');
console.log('PASS '+pass+'  FAIL '+fail);
process.exit(fail?1:0);
