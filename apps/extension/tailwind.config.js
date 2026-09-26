const path = require("node:path")
const withSharedTheme = require("tailwindconfig/tailwind.config")

/** @type {import('tailwindcss').Config} */
module.exports = withSharedTheme({
  content: [
    path.join(__dirname, "{popup,options}.tsx"),
    path.join(__dirname, "components/**/*.{ts,tsx}"),
    path.join(__dirname, "../../packages/ui/components/**/*.{ts,tsx}")
  ]
})
