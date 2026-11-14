// loads the kernel (src/core) into this Node process exactly as the browser build concatenates it
const fs=require('fs'),path=require('path'),vm=require('vm');
const dir=path.join(__dirname,'..','src','core');
for(const f of fs.readdirSync(dir).filter(f=>f.endsWith('.js')).sort())vm.runInThisContext(fs.readFileSync(path.join(dir,f),'utf8'),{filename:f});
module.exports=globalThis.LW;
