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
ok('autoBillOn por defecto true', window.autoBillOn()===true);
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
window.seeInvoice(S.invoices[0].id);
const modalHtml = document.getElementById('modal').innerHTML;
ok('factura: contiene invoiceDoc', /invoiceDoc/.test(modalHtml));
ok('factura: tabla de conceptos', /invTable/.test(modalHtml));
ok('factura: total y emisor', /TOTAL/.test(modalHtml) && /Cristina Romera/.test(modalHtml));
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
function iso(daysFromNow, hhmm){const d=new Date(Date.now()+daysFromNow*86400000);return d.toISOString().slice(0,10)+'T'+hhmm;}
S.sessions.push({id:'sa',c:'c1',start:iso(0,'23:30'),price:60,st:'programada',inv:'',rem:false,noBill:false}); // hoy tarde-noche (futura)
S.sessions.push({id:'sb',c:'c1',start:iso(3,'10:00'),price:60,st:'programada',inv:'',rem:false,noBill:false}); // dentro de 3 días
window.F='next';
window.go('agenda');
const ag = document.getElementById('screen').innerHTML;
ok('agenda muestra "Próxima cita"', /Próxima cita/.test(ag));
ok('agenda agrupa por día (cabecera Hoy)', /Hoy ·/.test(ag));
ok('cita de hoy aparece en Próximas', /sa|23:30/.test(ag) && /23:30/.test(ag));
ok('chips Próximas/Semana/Mes/Todas', /Semana/.test(ag) && /Mes/.test(ag) && /Todas/.test(ag));

console.log('\n== Crear cita: default mañana 16:00 ==');
window.sessionForm();
const sf = document.getElementById('modal').innerHTML;
const tomorrow = new Date(Date.now()+86400000).toISOString().slice(0,10);
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

console.log('\n== Resumen ==');
console.log('PASS '+pass+'  FAIL '+fail);
process.exit(fail?1:0);
