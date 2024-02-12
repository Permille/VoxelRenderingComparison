import http from "http";
import path from "path";
import url from "url";
import fs from "fs";

const ExtensionToMIME = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".xhtml": "text/html",
  ".html": "text/html",
  ".css": "text/css",
  ".png": "image/png"
};

const Server = http.createServer(async function(Request, Response){
  const Path = path.join(path.dirname(url.fileURLToPath(import.meta.url)), url.parse(Request.url).pathname);
  console.log(Path);
  try{
    const File = await fs.promises.readFile(Path);
    Response.setHeader("Content-type", ExtensionToMIME[path.parse(Path).ext] ?? "text/plain");
    Response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    Response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    Response.end(File);
  } catch{
    Response.statusCode = 404;
    Response.end(`File at location "${Path}" does not exist.`);
  }
});

const IP = "127.0.0.1";
const Port = 61440;
Server.listen(Port, IP, console.log.bind(null, `Demo loaded at http://${IP}:${Port}/index.html`));