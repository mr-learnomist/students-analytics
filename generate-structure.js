const fs = require("fs");
const path = require("path");

// ============================================
//   APNA STRUCTURE YAHAN DEFINE KARO
//   null = sirf folder banana hai
//   "" = empty file banana hai
//   "content" = file me yeh text likhna hai
// ============================================

const PROJECT_NAME = "my-awesome-project"; // <-- apna project naam badlo

const STRUCTURE = {
  "public/": {
    "assets/": null,
    "index.html": "<!DOCTYPE html>\n<html lang='en'>\n<head><meta charset='UTF-8'/><title>My App</title></head>\n<body><div id='root'></div></body>\n</html>",
    "favicon.ico": "",
  },
  "src/": {
    "components/": {
      ".gitkeep": "",
    },
    "pages/": {
      ".gitkeep": "",
    },
    "hooks/": {
      ".gitkeep": "",
    },
    "services/": {
      ".gitkeep": "",
    },
    "utils/": {
      ".gitkeep": "",
    },
    "store/": {
      ".gitkeep": "",
    },
    "styles/": {
      "global.css": "/* Global styles */\n* { box-sizing: border-box; margin: 0; padding: 0; }\n",
    },
    "App.js": "import React from 'react';\n\nfunction App() {\n  return <div>Hello World</div>;\n}\n\nexport default App;\n",
    "index.js": "import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App';\n\nconst root = ReactDOM.createRoot(document.getElementById('root'));\nroot.render(<App />);\n",
  },
  "server/": {
    "controllers/": {
      ".gitkeep": "",
    },
    "models/": {
      ".gitkeep": "",
    },
    "routes/": {
      ".gitkeep": "",
    },
    "config/": {
      "db.js": "// Database connection config\nmodule.exports = {};\n",
    },
    "index.js": "const express = require('express');\nconst app = express();\n\napp.listen(5000, () => console.log('Server running on port 5000'));\n",
  },
  ".env": "# Environment variables\nPORT=3000\nDB_URL=your_db_url_here\nSECRET_KEY=your_secret_key\n",
  ".gitignore": "node_modules/\n.env\ndist/\nbuild/\n.DS_Store\n",
  "package.json": JSON.stringify(
    {
      name: "my-awesome-project",
      version: "1.0.0",
      description: "",
      main: "src/index.js",
      scripts: {
        start: "react-scripts start",
        build: "react-scripts build",
        test: "react-scripts test",
      },
      dependencies: {
        react: "^18.0.0",
        "react-dom": "^18.0.0",
      },
    },
    null,
    2
  ),
  "README.md":
    "# My Awesome Project\n\nYahan apna project description likho.\n\n## Setup\n```bash\nnpm install\nnpm start\n```\n",
};

// ============================================
//   SCRIPT LOGIC — NEECHE KUCH CHANGE MAT KARO
// ============================================

const BASE_DIR = path.join(process.cwd(), PROJECT_NAME);
let createdFolders = 0;
let createdFiles = 0;

function createStructure(obj, currentPath) {
  for (const [key, value] of Object.entries(obj)) {
    const fullPath = path.join(currentPath, key);

    if (key.endsWith("/")) {
      // Folder banana hai
      fs.mkdirSync(fullPath, { recursive: true });
      createdFolders++;
      console.log(`📁 Folder: ${fullPath}`);
      if (value && typeof value === "object") {
        createStructure(value, fullPath);
      }
    } else {
      // File banana hai
      const dir = path.dirname(fullPath);
      fs.mkdirSync(dir, { recursive: true });
      const content = value || "";
      fs.writeFileSync(fullPath, content, "utf8");
      createdFiles++;
      console.log(`📄 File:   ${fullPath}`);
    }
  }
}

// Already exist kare to warn karo
if (fs.existsSync(BASE_DIR)) {
  console.log(`\n⚠️  Warning: "${PROJECT_NAME}" folder already exists!`);
  console.log("   Existing files overwrite ho sakti hain.\n");
}

console.log(`\n🚀 "${PROJECT_NAME}" project structure ban raha hai...\n`);

try {
  fs.mkdirSync(BASE_DIR, { recursive: true });
  createStructure(STRUCTURE, BASE_DIR);
  console.log(`\n✅ Done!`);
  console.log(`   📁 Folders created : ${createdFolders}`);
  console.log(`   📄 Files created   : ${createdFiles}`);
  console.log(`   📍 Location        : ${BASE_DIR}\n`);
} catch (err) {
  console.error("\n❌ Error:", err.message);
}
