const major = Number(process.versions.node.split(".")[0]);

if (major !== 22) {
  console.error(`forge doctor: expected Node 22.x from .nvmrc; found ${process.version}`);
  process.exit(1);
}

console.log(`forge doctor: PASS · Node ${process.version}`);
