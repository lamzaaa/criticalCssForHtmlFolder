#!/usr/bin/env node

const clc = require('cli-color');
const path = require('path');
const penthouse = require('penthouse');
const fs = require('fs');
const ora = require('ora');
const inquirer = require('inquirer');
const AutocompletePrompt = require('inquirer-autocomplete-prompt');

var error = clc.red.bold;
var warn = clc.yellow;
var notice = clc.blue;
console.log('-----------------------');
console.log(clc.greenBright('Running Critical CSS...'));
console.log('-----------------------');

const folderQuestion = [
	{
		type: 'autocomplete',
		name: 'folderName',
		message: 'Type or select your folder name. ',
		source: async function (answersSoFar, input) {
			const cwd = process.cwd();
			const files = await fs.promises.readdir(cwd);
			const directories = files.filter(file =>
				fs.statSync(path.join(cwd, file)).isDirectory()
			);
			return directories.filter(directory => directory.includes(input));
		},
	},
];

const htmlQuestion = [
	{
		type: 'list',
		name: 'htmlFile',
		message: 'Select your html file. ',
		choices: [],
	},
];

const cssQuestion = [
	{
		type: 'list',
		name: 'cssFile',
		message: 'Select your css file. ',
		choices: [],
	},
];

var filePath;

inquirer.registerPrompt('autocomplete', AutocompletePrompt);
inquirer.prompt(folderQuestion).then(async answer => {
	const { folderName } = answer;

	const htmlFiles = await getHtmlFiles(folderName);
	if (htmlFiles.length === 0) {
		console.log(error(`No HTML files found in ${folderName} folder.`));
		return;
	}

	htmlQuestion[0].choices = htmlFiles;
	inquirer.prompt(htmlQuestion).then(async answer => {
		const { htmlFile } = answer;
		filePath = htmlFile;
		const cssFiles = await getCssFiles(htmlFile);
		if (cssFiles.length === 0) {
			console.log(error('No CSS files found in HTML file.'));
			return;
		}
		cssQuestion[0].choices = cssFiles;
		inquirer.prompt(cssQuestion).then(answer => {
			console.log('Selected CSS file:', clc.red(answer.cssFile));
			generateCriticalCss(filePath, answer.cssFile);
		});
	});
});

async function getHtmlFiles(folderName) {
	const htmlFiles = [];

	const files = await fs.promises.readdir(folderName);
	for (const file of files) {
		const filePath = path.join(folderName, file);
		const stat = await fs.promises.stat(filePath);
		if (stat.isFile() && path.extname(filePath) === '.html') {
			htmlFiles.push(filePath);
		}
	}

	return htmlFiles;
}

async function getCssFiles(htmlFile) {
	const cssFiles = [];

	const data = await fs.promises.readFile(htmlFile, 'utf8');
	const regex = /<link\s+.*href="(.*)\.css".*>/g;
	let match;
	while ((match = regex.exec(data)) !== null) {
		const cssFilePath = path.join(path.dirname(htmlFile), match[1] + '.css');
		try {
			await fs.promises.access(cssFilePath, fs.constants.R_OK);
			cssFiles.push(cssFilePath);
		} catch (err) {
			console.error(
				`Error accessing CSS file ${cssFilePath}: ${error(err.message)}`
			);
		}
	}

	return cssFiles;
}
function generateCriticalCss(filePath, cssPath) {
	const fullPath = path.resolve(filePath);
	const selectedCssFileName = path.basename(cssPath, '.css');
	const htmlFileName = path.basename(filePath, '.html');
	const criticalCssDir = path.join(
		path.dirname(filePath),
		'critical-css-generator'
	);
	// Create the critical-css-generator directory if it doesn't exist
	if (!fs.existsSync(criticalCssDir)) {
		fs.mkdirSync(criticalCssDir);
	}

	const outputPath = path.join(
		path.dirname(filePath),
		`critical-css-generator/critical-${selectedCssFileName}.css`
	);
	const screenshotPath = path.join(path.dirname(outputPath), htmlFileName);
	const spinner = ora('Optimizing CSS...').start();
	penthouse(
		{
			url: `file://${fullPath}`,
			css: cssPath,
			width: 1200,
			height: 900,
			screenshots: {
				basePath: screenshotPath,
				type: 'jpeg', // jpeg or png, png default
				quality: 50, // only applies for jpeg type
			},
		},
		(err, output) => {
			if (err) {
				spinner.fail(`Failed to optimize CSS: ${clc.red(err.message)}`);
				return;
			} else {
				const parentDir = path.dirname(outputPath);
				if (!fs.existsSync(parentDir)) {
					fs.mkdirSync(parentDir, { recursive: true });
				}
				// Ensure the screenshot directory exists before creating the screenshot
				fs.writeFileSync(outputPath, output);
				spinner.succeed(`Optimized CSS written to: ${clc.green(outputPath)}`);
			}
		}
	);
}
