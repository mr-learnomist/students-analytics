const fs = require("fs");
const path = require("path");

// ============================================
//   SETTINGS
// ============================================

const ROOT_DIR = process.cwd();       // Jis folder me script hai, wahi scan hoga
const OUTPUT_FILE = "structure.txt";  // Output file ka naam

// Yeh folders/files IGNORE honge
const IGNORE = [
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  ".DS_Store",
  "*.log",
];

// ============================================
//   SCRIPT LOGIC
// ============================================

function shouldIgnore(name) {
  return IGNORE.some((pattern) => {
    if (pattern.startsWith("*")) {
      return name.endsWith(pattern.slice(1));
    }
    return name === pattern;
  });
}

function buildTree(dirPath, prefix = "") {
  let lines = [];

  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return lines;
  }

  // Pehle folders, phir files
  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  // Ignore list filter
  entries = entries.filter((e) => !shouldIgnore(e.name));

  entries.forEach((entry, index) => {
    const isLast = index === entries.length - 1;
    const connector = isLast ? "└── " : "├── ";
    const childPrefix = isLast ? "    " : "│   ";

    if (entry.isDirectory()) {
      lines.push(prefix + connector + entry.name + "/");
      const children = buildTree(path.join(dirPath, entry.name), prefix + childPrefix);
      lines = lines.concat(children);
    } else {
      lines.push(prefix + connector + entry.name);
    }
  });

  return lines;
}

// Root folder ka naam
const rootName = path.basename(ROOT_DIR) + "/";

// Tree banao
const treeLines = buildTree(ROOT_DIR);

// Output text
const output = [rootName, ...treeLines].join("\n");

// File save karo
const outputPath = path.join(ROOT_DIR, OUTPUT_FILE);
fs.writeFileSync(outputPath, output, "utf8");

console.log("\n✅ Structure save ho gaya!");
console.log(`📄 File: ${outputPath}`);
console.log(`📊 Total lines: ${treeLines.length}`);
console.log("\n--- Preview ---\n");
console.log(output.split("\n").slice(0, 20).join("\n"));
if (treeLines.length > 20) {
  console.log(`... aur ${treeLines.length - 20} lines aur hain`);
}
console.log("\n---------------\n");
