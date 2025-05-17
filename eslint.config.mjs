import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs}"],
    plugins: { js },
    extends: ["js/recommended"],
  },
  {
    files: ["**/*.{js,cjs}"],  // Include .js files here
    languageOptions: { 
      sourceType: "commonjs",
      globals: globals.node  // Add Node.js globals which include 'require' and 'module'
    },
  },
  {
    files: ["**/*.mjs"],  // Only .mjs files as modules
    languageOptions: { 
      sourceType: "module",
      globals: globals.browser
    },
  },
]);