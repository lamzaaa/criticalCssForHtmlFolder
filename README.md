# Critical CSS Generator

This is a Node.js command-line interface (CLI) tool that generates critical CSS for a given HTML file and CSS file. Critical CSS is the minimum amount of CSS required to render a web page above the fold (i.e., the portion of the page that is visible in the browser window without scrolling). Generating critical CSS can improve page load times and user experience by reducing the amount of CSS that needs to be downloaded and parsed by the browser.

## Installation

To use this tool, you must have Node.js and npm installed on your system. If you do not have them installed, you can download them from the official Node.js website (https://nodejs.org/en/).

After installing Node.js and npm, you can install the tool by running the following command in your terminal:

```
npm install -g critical-css-generator
```

## Usage

To generate critical CSS, run the following command in your terminal:

```
critical-css-generator
```

Or use directly online:

```
npx critical-css-generator
```

## Folder structure example

anyHTMLFolder

    │ index.html

    │ introduce.html

    │ contact.html

    │ .....

## Dependencies

This tool relies on the following Node.js packages:

- cli-color
- path
- penthouse
- fs
- ora
- inquirer

These packages are automatically installed when you install the tool using npm.
