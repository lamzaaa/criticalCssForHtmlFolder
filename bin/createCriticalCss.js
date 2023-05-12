#!/usr/bin/env node

const clc = require('cli-color');
const path = require('path');
const penthouse = require('penthouse');
const fs = require('fs');
const ora = require('ora');
const inquirer = require('inquirer');
const AutocompletePrompt = require('inquirer-autocomplete-prompt');
const axios = require('axios');
const cheerio = require('cheerio');
const fetchHtml = require('./fetchHtml');

var error = clc.red.bold;
var warn = clc.yellow;
var notice = clc.blue;
console.log('-----------------------');
console.log(clc.greenBright('Running Critical CSS...'));
console.log('-----------------------');

var setUserChoices = ['Current Folder', 'Domain'];

const userOption = [
	{
		type: 'list',
		name: 'userOption',
		message: 'Use current folder or domain ?',
		choices: setUserChoices,
	},
];

const setDomain = [
	{
		type: 'input',
		name: 'domainInput',
		message: 'Enter your domain.',
		choices: setUserChoices,
		validate: function (input) {
			// Regular expression to check for a valid domain format with http:// or https://
			const domainRegex = /^(https?:\/\/)(?:\w+\.)+\w+/;

			if (domainRegex.test(input)) {
				return true;
			} else {
				return 'Invalid domain format. Please enter a valid domain with http:// or https://.';
			}
		},
	},
];

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
inquirer.prompt(userOption).then(async answer => {
	const { userOption } = answer;
	if (userOption == setUserChoices[0]) {
		// Current Folder
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
	}
	if (userOption === setUserChoices[1]) {
		// Domain
		console.log('You have selected: ' + notice(setUserChoices[1]));
		inquirer.prompt(setDomain).then(answer => {
			const { domainInput } = answer;
			const htmlUrl = domainInput;
			console.log(typeof domainInput);

			const spinner = ora('Fetching domain...').start();
			fetchHtml(htmlUrl)
				.then(async htmlResponse => {
					const htmlContent = htmlResponse;

					// Create the "domain" folder
					const domainFolderPath = path.join(
						process.cwd(),
						domainInput.split('//')[1]
					);
					if (!fs.existsSync(domainFolderPath)) {
						fs.mkdirSync(domainFolderPath, { recursive: true });
					}

					// Save the HTML content to a local file
					const htmlFilePath = path.join(domainFolderPath, 'temp.html');
					fs.writeFileSync(htmlFilePath, htmlContent, 'utf-8');

					spinner.succeed('HTML downloaded.');

					// Load the HTML content using Cheerio
					const $ = cheerio.load(htmlContent);
					const cssFiles = [];

					$('link[rel="stylesheet"]').each((index, element) => {
						const cssUrl = $(element).attr('href');
						if (cssUrl) {
							const absoluteCssUrl = new URL(cssUrl, domainInput).href;
							cssFiles.push(absoluteCssUrl);
						}
					});

					if (cssFiles.length === 0) {
						spinner.fail('No CSS files found in the HTML.');
						return;
					}

					// Prompt the user to select a CSS file
					cssQuestion[0].choices = cssFiles;

					inquirer.prompt(cssQuestion).then(answer => {
						const { cssFile } = answer;
						// Download the selected CSS file
						const cssFolderPath = path.join(domainFolderPath, 'css');
						if (!fs.existsSync(cssFolderPath)) {
							fs.mkdirSync(cssFolderPath, { recursive: true });
						}

						const cssFileName = path.basename(cssFile);
						const localCssFilePath = path.join(cssFolderPath, cssFileName);

						const cssSpinner = ora('Downloading CSS file...').start();
						fetchHtml(cssFile)
							.then(cssContent => {
								fs.writeFileSync(localCssFilePath, cssContent, 'utf-8');
								cssSpinner.succeed('CSS file downloaded.');

								// Call the generateCriticalCss function with the local file paths
								generateCriticalCss(htmlFilePath, localCssFilePath);
							})
							.catch(error => {
								cssSpinner.fail(`Failed to download CSS file: ${error}`);
							});
					});
				})
				.catch(error => {
					spinner.fail(`Failed to download HTML: ${clc.red(error.message)}`);
				});
		});
	}

	return;
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
	const regex = /<link\s+.*href="([^"]+\.css)".*>/g;
	let match;
	while ((match = regex.exec(data)) !== null) {
		let cssFilePath = match[1];
		// Skip if the CSS file path starts with "http://" or "https://" (CDN or online link)
		if (
			!cssFilePath.startsWith('http://') &&
			!cssFilePath.startsWith('https://')
		) {
			// Check if the CSS file path starts with "./"
			if (cssFilePath.startsWith('./')) {
				cssFilePath = cssFilePath.substr(2); // Remove the leading "./"
			}
			const absoluteCssFilePath = path.join(
				path.dirname(htmlFile),
				cssFilePath
			);
			try {
				await fs.promises.access(absoluteCssFilePath, fs.constants.R_OK);
				cssFiles.push(absoluteCssFilePath);
			} catch (err) {
				console.log(
					`Error accessing CSS file ${absoluteCssFilePath}: ${error(
						err.message
					)}`
				);
			}
		} else {
			try {
				const response = await axios.get(cssFilePath);
				const cssContent = response.data;

				// Save the CSS content to a local file
				const cssFolderPath = path.join(process.cwd(), 'domain');
				if (!fs.existsSync(cssFolderPath)) {
					fs.mkdirSync(cssFolderPath, { recursive: true });
				}

				const cssFileName = path.basename(cssFilePath);
				const localCssFilePath = path.join(cssFolderPath, cssFileName);
				fs.writeFileSync(localCssFilePath, cssContent);

				cssFiles.push(localCssFilePath);
			} catch (err) {
				console.log(
					`Error downloading CSS file ${cssFilePath}: ${error(err.message)}`
				);
			}
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
	const cssFileNameWithoutVersion = selectedCssFileName.split('?')[0];
	const outputPath = path.join(
		path.dirname(filePath),
		`critical-css-generator/critical-${cssFileNameWithoutVersion}.css`
	);
	const screenshotPath = path.join(path.dirname(outputPath), htmlFileName);
	const spinner = ora('Optimizing CSS...').start();
	penthouse(
		{
			url: `file://${fullPath}`,
			css: cssPath,
			width: 1200,
			height: 900,
			timeout: 300000,
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
