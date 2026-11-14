#!/usr/bin/env node
// Deterministic, dependency-free build: concatenates src/core + src/ui into ONE self-contained HTML file.
// Usage: node tools/build.cjs   (no network, no npm install required)
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.join(__dirname,'..'),rd=f=>fs.readFileSync(path.join(root,f),'utf8');
const list=d=>fs.readdirSync(path.join(root,d)).filter(f=>f.endsWith('.js')).sort().map(f=>d+'/'+f);
const files=list('src/core').concat(list('src/ui'));
let js=files.map(f=>'// ===== '+f+' =====\n'+rd(f).trim()).join('\n');
if(js.includes('</script'))throw new Error('source contains a closing script tag');
const id=crypto.createHash('sha256').update(js).digest('hex').slice(0,12);
js='globalThis.LW_BUILD="'+id+'";\n'+js;
const html=rd('src/index.template.html').replace('/*__CSS__*/',()=>rd('src/ui/style.css').trim()).replace('/*__JS__*/',()=>js);
fs.writeFileSync(path.join(root,'Living_World.html'),html);
fs.mkdirSync(path.join(root,'android/www'),{recursive:true});
fs.writeFileSync(path.join(root,'android/www/index.html'),html);
console.log('Living_World.html',(html.length/1024).toFixed(1)+' KB','build',id,'sha256',crypto.createHash('sha256').update(html).digest('hex'));
