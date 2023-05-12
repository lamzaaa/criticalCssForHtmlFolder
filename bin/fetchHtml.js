const phantom = require('phantom');

module.exports = async function fetchHtml(url) {
	const instance = await phantom.create([
		'--ignore-ssl-errors=yes',
		'--load-images=no',
	]);
	const page = await instance.createPage();

	await page.open(url);
	const htmlContent = await page.property('content');

	await instance.exit();

	return htmlContent;
};
