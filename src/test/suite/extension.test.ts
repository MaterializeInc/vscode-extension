// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import * as assert from 'assert';
import { mockServer } from './server';
import { Config } from '../../context/config';
import * as os from "os";
import * as fs from "fs";
import AppPassword from '../../context/appPassword';
import { randomUUID } from 'crypto';
import AsyncContext from '../../context/asyncContext';

/**
 * Simple util function to use delay.
 * @param ms timeout
 * @returns
 */
function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Remove the configuration file if exists.
const configDir = `${os.homedir()}/.config/materialize/test`;
const filePath = `${configDir}/mz.toml`;

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	let extension: vscode.Extension<any>;

	suiteSetup(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
		await mockServer();
		console.log("[Test]","Server mocked.");

		// Remove the configuration file if exists.
		process.env["MZ_CONFIG_PATH"] = configDir;

		try {
			fs.unlinkSync(filePath);
		} catch (err) {
			console.log("[Test]", "Config file is clean.");
		}
	});

	// TODO: Remove after 0.3.0
	test('Migration', async () => {
		const configDir = `${os.homedir()}/.config/materialize/test`;
		if (!fs.existsSync(configDir)) {
			try {
				fs.mkdirSync(configDir, { recursive: true });
				console.log("[Context]", "Directory created: ", configDir);
			} catch (error) {
				console.log("[Context]", "Error creating configuration file dir:", configDir, error);
				throw error;
			}
		}

		const filePath = `${configDir}/mz.toml`;
		process.env["MZ_CONFIG_PATH"] = configDir;

		fs.writeFileSync(filePath, `
		profile = "default"

		[profiles.default]
		app-password = "mzp_4e5c0aea72ac41de946c57f1b67bb3af4e5c0aea72ac41de946c57f1b67bb3af"
		region = "aws/us-east-1"

		[profiles.alternative]
		app-password = "mzp_4e5c0aea72ac41de946c57f1b67bb3af4e5c0aea72ac41de946c57f1b67bb3af"
		region = "aws/us-east-1"
		vault = "inline"
		`, 'utf-8');

		new Config();
		// Wait migration to save the update.
		await delay(500);
		let content = fs.readFileSync(filePath, 'utf-8');
		console.log("Content: ", content);

		if (process.platform === "darwin") {
			// Assert the migration is done.
			assert.ok(content === `profile = "default"\n\n[profiles.default]\nregion = "aws/us-east-1"\n\n[profiles.alternative]\napp-password = "mzp_4e5c0aea72ac41de946c57f1b67bb3af4e5c0aea72ac41de946c57f1b67bb3af"\nregion = "aws/us-east-1"\nvault = "inline"\n`);
		} else {
			assert.ok(content === `profile = "default"\n\n[profiles.default]\napp-password = "mzp_4e5c0aea72ac41de946c57f1b67bb3af4e5c0aea72ac41de946c57f1b67bb3af"\nregion = "aws/us-east-1"\n\n[profiles.alternative]\napp-password = "mzp_4e5c0aea72ac41de946c57f1b67bb3af4e5c0aea72ac41de946c57f1b67bb3af"\nregion = "aws/us-east-1"\nvault = "inline"\n`);
		}

		// Second case:
		fs.writeFileSync(filePath, `
		profile = "default"
		vault = "inline"

		[profiles.default]
		app-password = "mzp_4e5c0aea72ac41de946c57f1b67bb3af4e5c0aea72ac41de946c57f1b67bb3af"
		region = "aws/us-east-1"

		[profiles.alternative]
		app-password = "mzp_4e5c0aea72ac41de946c57f1b67bb3af4e5c0aea72ac41de946c57f1b67bb3af"
		region = "aws/us-east-1"
		`, 'utf-8');

		// Trigger migration again
		new Config();
		await delay(500);

		// Check content
		content = fs.readFileSync(filePath, 'utf-8');
		assert.ok(content === `profile = "default"\nvault = "inline"\n\n[profiles.default]\napp-password = "mzp_4e5c0aea72ac41de946c57f1b67bb3af4e5c0aea72ac41de946c57f1b67bb3af"\nregion = "aws/us-east-1"\n\n[profiles.alternative]\napp-password = "mzp_4e5c0aea72ac41de946c57f1b67bb3af4e5c0aea72ac41de946c57f1b67bb3af"\nregion = "aws/us-east-1"\n`);


		// Third case:
		fs.writeFileSync(filePath, `
		profile = "default"
		vault = "inline"

		[profiles.default]
		app-password = "mzp_4e5c0aea72ac41de946c57f1b67bb3af4e5c0aea72ac41de946c57f1b67bb3af"
		region = "aws/us-east-1"
		vault = "keychain"

		[profiles.alternative]
		app-password = "mzp_4e5c0aea72ac41de946c57f1b67bb3af4e5c0aea72ac41de946c57f1b67bb3af"
		region = "aws/us-east-1"
		`, 'utf-8');

		// Trigger migration again
		new Config();
		await delay(500);

		// Check content
		content = fs.readFileSync(filePath, 'utf-8');
		if (process.platform === "darwin") {
			// Assert the migration is done.
			assert.ok(content === `profile = "default"\nvault = "inline"\n\n[profiles.default]\nregion = "aws/us-east-1"\nvault = "keychain"\n\n[profiles.alternative]\napp-password = "mzp_4e5c0aea72ac41de946c57f1b67bb3af4e5c0aea72ac41de946c57f1b67bb3af"\nregion = "aws/us-east-1"\n`);
		} else {
			assert.ok(content === `profile = "default"\nvault = "inline"\n\n[profiles.default]\napp-password = "mzp_4e5c0aea72ac41de946c57f1b67bb3af4e5c0aea72ac41de946c57f1b67bb3af"\nregion = "aws/us-east-1"\nvault = "keychain"\n\n[profiles.alternative]\napp-password = "mzp_4e5c0aea72ac41de946c57f1b67bb3af4e5c0aea72ac41de946c57f1b67bb3af"\nregion = "aws/us-east-1"\n`);
		}
	});

	test('Configuration file', async () => {
		try {
			fs.unlinkSync(filePath);
		} catch (err) {
			console.error("Err unlinking: ", err);
		}
		const config = new Config();
		const profile = config.getProfile();

		assert.ok(profile === undefined);

		// Alternative test profile.
		await config.addAndSaveProfile(
			"test_alt",
			new AppPassword(randomUUID().replace("-", ""), randomUUID().replace("-", "")),
			"aws/us-east-1",
			"http://localhost:3000",
			"http://localhost:3000"
		);

				// Alternative invalid test profile.
		// The API should return a 401 for this userId.
		await config.addAndSaveProfile(
			"invalid_profile",
			new AppPassword("52881e4b8c724ec1bcc6f9d22155821b", "52881e4b8c724ec1bcc6f9d22155821b"),
			"aws/us-east-1",
			"http://localhost:3000",
			"http://localhost:3000"
		);

		// Main test profile.
		// This will be assigned as the default one.
		await config.addAndSaveProfile(
			"test",
			new AppPassword(randomUUID().replace("-", ""), randomUUID().replace("-", "")),
			"aws/us-east-1",
			"http://localhost:3000",
			"http://localhost:3000"
		);

		assert.equal(3, (config.getProfileNames() || []).length);
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
        const _context: AsyncContext = await extension.activate();
		assert.ok(typeof _context !== null && typeof _context !== "undefined");

		await _context.isReady();
	}).timeout(10000);

	test('Test query execution', async () => {
		const _context: AsyncContext = await extension.activate();
		const rows = _context.query("SELECT 100");

		assert.ok((await rows).rowCount > 0);
	},);

	test('Change cluster', async () => {
        const context: AsyncContext = await extension.activate();
		const clusterName = context.getCluster();
		const altClusterName = context.getClusters()?.find(x => x.name !== clusterName);
		assert.ok(typeof altClusterName?.name === "string");
		context.setCluster(altClusterName.name);
		const rows = await context.query("SHOW CLUSTER;");

		assert.ok(rows.rows[0].cluster === altClusterName.name);
	}).timeout(10000);

	/**
	 * Profiles
	 */
	test('Test profiles are loaded', async () => {
        const context: AsyncContext = await extension.activate();
		const profileNames = context.getProfileNames();
		assert.ok(profileNames && profileNames.length > 0);
	});

	test('Change profile', async () => {
        const context: AsyncContext = await extension.activate();
		const profileName = context.getProfileName();
		const altProfileName = context.getProfileNames()?.find(x => x !== profileName);

		console.log("Alt Profile name: ", altProfileName);
		assert.ok(typeof altProfileName === "string");

		await context.setProfile(altProfileName);
		assert.ok(altProfileName === context.getProfileName());
	}).timeout(15000);

	test('Detect invalid password', async () => {
        const context: AsyncContext = await extension.activate();
		let err = false;

		try {
			await context.setProfile("invalid_profile");
			await context.getAppPassword();
		} catch (error) {
			err = true;
		}

		assert.ok(err);

	}).timeout(10000);
});