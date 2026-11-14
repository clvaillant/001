#!/usr/bin/env node
// Packages the editable source project as Living_World_Source.zip (uses the system `zip`).
const cp=require('child_process'),path=require('path'),fs=require('fs');
const root=path.join(__dirname,'..'),out=path.join(root,'Living_World_Source.zip');
if(fs.existsSync(out))fs.unlinkSync(out);
const items=['src','tools','tests/load.cjs','tests/unit.cjs','tests/lan.cjs','tests/browser.cjs','tests/run-all.cjs','android','package.json','README.md','FEATURE_MATRIX.md','TEST_REPORT.md','test-results.json',
  'WORLD_FORMAT.md','DEVELOPMENT_STATUS.md','Living_World.html','.gitignore'].filter(f=>fs.existsSync(path.join(root,f)));
cp.execFileSync('zip',['-q','-r','-X',out].concat(items),{cwd:root});
console.log('Living_World_Source.zip',(fs.statSync(out).size/1024).toFixed(0)+' KB',items.length+' top-level items');
