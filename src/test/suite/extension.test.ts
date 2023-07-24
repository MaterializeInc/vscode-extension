// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import * as assert from 'assert';
import { Context } from '../../context';

function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	suiteSetup(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
	});

	let extension: vscode.Extension<any>;
	let context: Context;

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
		await delay(50);
		assert.ok(extension?.isActive);
	});

	test('Test context readiness', async () => {
        const _context: Context = await extension.activate();
		assert.ok(typeof _context !== null && typeof _context !== "undefined");
        context = _context;

		await _context.isReady();
	}).timeout(10000);

	test('Test query execution', async () => {
		await vscode.commands.executeCommand("materialize.run");
	},);

	// It is not possible to test with simple mocha.
	// VSCode Extension Tester needs to be setup: https://github.com/redhat-developer/vscode-extension-tester
	// Test change profile
	// Test change cluster
	// Test change database
	// Test change schema
	// Test explorer
	// Test results.
});