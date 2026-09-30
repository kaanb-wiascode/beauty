import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const roots=["app","components","lib"].map(p=>path.join(root,p));
const strict=process.argv.includes("--strict");
const ignore=new Set([
  path.join(root,"lib","user-language.ts"),
  path.join(root,"lib","card-help.ts"),
]);
const extensions=new Set([".ts",".tsx"]);
const technicalLiteral=/["'`]([A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+)["'`]/g;
const directRender=/{[^}\n]*\.(status|type|code|action|title|description|message|recommendation)[^}\n]*}/g;
const englishHint=/\b(?:review|maximum|minimum|resolve|failed|success|warning|critical|pending|approved|rejected|created|updated|deleted|branch|customer|payment|financial|liquidity|account|status|required|not found|invalid|please|select|save|cancel|close|open)\b/i;
const userFacingAttr=/(?:title|description|label|placeholder|aria-label)=["'`]([^"'`]+)["'`]/g;

function walk(dir,out=[]){
  if(!fs.existsSync(dir)) return out;
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()) walk(full,out);
    else if(extensions.has(path.extname(entry.name))&&!/\.(spec|test)\./.test(entry.name)) out.push(full);
  }
  return out;
}
function lineOf(text,index){return text.slice(0,index).split("\n").length;}
function rel(file){return path.relative(root,file).replaceAll("\\","/");}
const findings=[];
for(const file of roots.flatMap(r=>walk(r))){
  if(ignore.has(file)) continue;
  const text=fs.readFileSync(file,"utf8");
  for(const match of text.matchAll(technicalLiteral)){
    const line=text.slice(text.lastIndexOf("\n",match.index)+1,text.indexOf("\n",match.index));
    if(/(?:value\s*:|case\s|===|!==|includes\(|Record<|type\s|interface\s|const\s|enum\s|method\s*:|status\s*:|kind\s*:|code\s*:|new Set\(|\|\s*["'`][A-Z0-9_\-]+["'`]|body\s*:|note\s*=|sourceType\s*:|source_type)/.test(line)) continue;
    findings.push({severity:"critical",rule:"technical-code",file:rel(file),line:lineOf(text,match.index),sample:match[1]});
  }
  for(const match of text.matchAll(directRender)){
    const line=text.slice(text.lastIndexOf("\n",match.index)+1,text.indexOf("\n",match.index));
    if(/user(Label|Text|Error|Notice)|CFO_STATUS_LABEL|STATUS_LABELS|statusLabel|typeLabel|severityLabel|ORIGIN_LABELS|MOVEMENT_LABELS|TransferStatus|StatusPill|ApprovalBadge|FinanceStatus|format|toLocale|\.map\(|instanceof ApiError/.test(line)) continue;
    findings.push({severity:"warning",rule:"raw-backend-field",file:rel(file),line:lineOf(text,match.index),sample:match[0].slice(0,120)});
  }
  for(const match of text.matchAll(userFacingAttr)){
    const value=match[1];
    if(/[çğıöşüÇĞİÖŞÜ]/.test(value)) continue;
    if(!englishHint.test(value)) continue;
    if(/^(https?:|\/|[A-Z0-9_]+$)/.test(value)) continue;
    findings.push({severity:"warning",rule:"english-ui-literal",file:rel(file),line:lineOf(text,match.index),sample:value.slice(0,120)});
  }
}
const critical=findings.filter(x=>x.severity==="critical");
const warnings=findings.filter(x=>x.severity==="warning");
console.log(`Kullanıcı dili denetimi: ${critical.length} kritik, ${warnings.length} uyarı.`);

const moduleStats=new Map();
for(const item of findings){
  const match=item.file.match(/^app\/(?:\(app\)\/)?([^/]+)/);
  const moduleName=match?.[1] ?? (item.file.startsWith("components/") ? "ortak-bileşenler" : "diğer");
  const current=moduleStats.get(moduleName)??{critical:0,warning:0,total:0};
  current[item.severity==="critical"?"critical":"warning"]+=1;
  current.total+=1;
  moduleStats.set(moduleName,current);
}
console.log("Modül özeti:");
for(const [moduleName,stats] of [...moduleStats.entries()].sort((a,b)=>b[1].total-a[1].total).slice(0,30)){
  console.log(`- ${moduleName}: ${stats.critical} kritik, ${stats.warning} uyarı`);
}
for(const item of findings.slice(0,250)){
  console.log(`[${item.severity.toUpperCase()}] ${item.rule} ${item.file}:${item.line} — ${item.sample}`);
}
if(findings.length>250) console.log(`... ${findings.length-250} ek bulgu daha var.`);
if(strict&&critical.length) process.exit(1);
