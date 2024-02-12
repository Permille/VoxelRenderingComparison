//Asynchronous loaders: https://webpack.js.org/api/loaders/#asynchronous-loaders
const fs = require("fs");
const path = require("path");
const { emitWarning } = require("process");

async function ProcessIncludes(Code, OwnFolder){
  const Dependencies = [];
  let Match;
  while((Match = Code.match(/^#include .*$/m)) !== null){
    const [IncludeText, Prefix, Path] = /^#include ([a-zA-Z_][a-zA-Z0-9_]*) "(.*)".*$/.exec(Match[0]) ?? [];
    if(IncludeText === undefined) throw new Error("#include: Bad syntax");
    const AbsolutePath = path.join(OwnFolder, Path);
    Dependencies.push(AbsolutePath);
    try{
      //const FileContents = fs.readFileSync(AbsolutePath, "utf8");
      if(/.*\.mjs$/.test(Path)){
        const Exports = await import("file://" + AbsolutePath);
        for(const [Name, Value] of Object.entries(Exports)){
          if(typeof Value !== "number") continue;
          const Identifier = Prefix + "::" + Name;
          Code = Code.replaceAll(new RegExp(Identifier + "(?![a-zA-Z0-9_])", "g"), Value);
        }
      } else{
        throw new Error("#include: Couldn't process file type of file " + AbsolutePath);
      }
    } catch(e){
      throw e;
    }
    Code = Code.replace(/^#include .*$/m, "");
  }
  return [Code, Dependencies];
}
function ProcessConsts(Code){
  let Match;
  while((Match = Code.match(/^#const .*$/m)) !== null){
    const [DefineText, Original, Replaced] = /^#const ([a-zA-Z_][a-zA-Z0-9_]*) ([(0-9_ +-/*<>|&^)]*).*$/.exec(Match[0]) ?? [];
    if(DefineText === undefined) throw new Error("#const: Bad syntax");
    Code = Code.replaceAll(new RegExp(Original + "(?![a-zA-Z0-9_])", "g"), eval(Replaced));
    Code = Code.replace(/^#const .*$/m, "");
  }
  return Code;
}
function ProcessUnrolls(Code){
  return Code.replaceAll(/^#unroll (\d+)([\s\S]*?)^#end-unroll/mg, function(...a){
    return new Array(Number.parseInt(a[1]) + 1).fill("").join(a[2]);
  });
}

module.exports = function(RawContents, Map, Meta){
  const callback = this.async();
  void async function(){
    const wabt = await require("wabt")();
    let Code;
    try{
      let [Contents, Dependencies] = await ProcessIncludes(RawContents, this.context);
      for(const AbsolutePath of Dependencies) this.addDependency(AbsolutePath);
      Code = Contents;
    } catch(e){
      callback(null, "Error while compiling wat: " + e, Map, Meta);
      return;
    }
    Code = ProcessConsts(Code);
    Code = ProcessUnrolls(Code);



    try{
      const Module = wabt.parseWat("Test.wasm", Code, {
        "simd": true,
        "threads": true,
        "multi_value": true,
        "bulk_memory": true,
        "relaxed_simd": true
      });

      const Buffer = Module.toBinary({}).buffer;
      
      if(true){
        const Binaryen = (await import("binaryen")).default;
      
        const BinaryenModule = Binaryen.readBinary(new Uint8Array(Buffer));
        Binaryen.setOptimizeLevel(2);
        Binaryen.setShrinkLevel(0);
        Binaryen.setLowMemoryUnused(true);
        Binaryen.setAlwaysInlineMaxSize(64);

        BinaryenModule.optimize();
        const OptimisedBuffer = BinaryenModule.emitBinary();
        callback(null, "export default new Uint8Array([" + OptimisedBuffer + "]).buffer;", Map, Meta);
      } else{
        callback(null, "export default new Uint8Array([" + new Uint8Array(Buffer) + "]).buffer;", Map, Meta);
      }
      
    } catch(e){
      callback(null, "Error while compiling wat: " + e, Map, Meta);
    }
  }.bind(this)();
};