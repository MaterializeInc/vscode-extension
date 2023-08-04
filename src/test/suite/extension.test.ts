// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import * as assert from 'assert';
import { Context, EventType } from '../../context';
import { mockServer } from './server';
import { Config } from '../../context/config';
import * as os from "os";
import * as fs from "fs";
import AppPassword from '../../context/appPassword';
import { randomUUID } from 'crypto';

function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function waitForEvent(context: Context, eventType: EventType) {
	return new Promise(resolve => context.on("event", ({ type }) => {
		if (type === eventType) {
			resolve("");
		};
	}));
}

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	suiteSetup(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
		await mockServer();
		console.log("[Test]","Server mocked.");

		// Remove the configuration file if exists.
		const configDir = `${os.homedir()}/.config/materialize/test`;
		const filePath = `${configDir}/mz.toml`;
		process.env["MZ_CONFIG_PATH"] = configDir;

		try {
			fs.unlinkSync(filePath);
		} catch (err) {
			console.log("[Test]", "Config file is clean.");
		}
	});

	let extension: vscode.Extension<any>;
	let context: Context;

	test('Configuration file', async () => {
		const config = new Config();
		const profile = config.getProfile();

		assert.ok(profile === undefined);

		// Main test profile
		await config.addAndSaveProfile(
			"test",
			new AppPassword(randomUUID().replace("-", ""), randomUUID().replace("-", "")),
			"aws/us-east-1",
			"http://localhost:3000",
			"http://localhost:3000"
		);

		// Alternative test profile
		await config.addAndSaveProfile(
			"test_alt",
			new AppPassword(randomUUID().replace("-", ""), randomUUID().replace("-", "")),
			"aws/us-east-1",
			"http://localhost:3000",
			"http://localhost:3000"
		);

		assert.equal(2, (config.getProfileNames() || []).length);
	});

	test('Test extension activation', async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');

		// Create a new text document with SQL language identifier
		// to activate the extension.
		const doc = await vscode.workspace.openTextDocument({
			language: 'sql',
			content: 'SELECT 1;'
		});
		await vscode.window.showTextDocument(doc);

		// Wait for the extension to activate
		const _extension = vscode.extensions.getExtension('Materialize.vscode-materialize');
		assert.ok(typeof _extension !== "undefined");

		// Assign to the global extension
		extension = _extension;

		// Activation requires a small delay.
		await delay(300);
		assert.ok(extension?.isActive);
	});

	test('Test context readiness', async () => {
        const _context: Context = await extension.activate();
		assert.ok(typeof _context !== null && typeof _context !== "undefined");
        context = _context;

		await _context.isReady();
	}).timeout(10000);

	test('Test query execution', async () => {
		const listenNewQueryChange = waitForEvent(context, EventType.newQuery);
		const listenQueryResultsChange = waitForEvent(context, EventType.queryResults);
		await vscode.commands.executeCommand("materialize.run");

		// TODO: Verify the rows are ok.
		await listenNewQueryChange;
		await listenQueryResultsChange;
	},);

	/**
	 * Profiles
	 */
	test('Test profiles are loaded', async () => {
		const profileNames = context.getProfileNames();
		assert.ok(profileNames && profileNames.length > 0);
	});

	test('Change profile', async () => {
		const listenProfileChange = waitForEvent(context, EventType.environmentChange);
		const profileName = context.getProfileName();
		const altProfileName = context.getProfileNames()?.find(x => x !== profileName);
		console.log("Alt Profile name: ", altProfileName);
		assert.ok(typeof altProfileName === "string");
		context.setProfile(altProfileName);
		await listenProfileChange;
		assert.ok(altProfileName === context.getProfileName());
	}).timeout(15000);

	test('Change cluster', async () => {
		const listenEnvironmentChange = waitForEvent(context, EventType.environmentChange);
		const clusterName = context.getCluster()?.name;
		const altClusterName = context.getClusters()?.find(x => x.name !== clusterName);
		assert.ok(typeof altClusterName?.name === "string");
		context.setCluster(altClusterName.name);
		await listenEnvironmentChange;
	}).timeout(10000);

	// test('Change schema', async () => {
	// 	const listenEnvironmentChange = waitForEvent(context, EventType.environmentChange);
	// 	const schemaName = context.getSchema()?.name;
	// 	const altSchemaName = context.getSchemas()?.find(x => x.name !== schemaName);
	// 	assert.ok(typeof altSchemaName?.name === "string");
	// 	context.setSchema(altSchemaName.name);
	// 	await listenEnvironmentChange;
	// }).timeout(10000);

	// Test explorer
});