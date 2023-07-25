import { expect } from 'chai';
import { EditorView, InputBox, TextEditor, Workbench } from 'vscode-extension-tester';

describe('Text Editor sample tests', () => {
    let editor: TextEditor;
    let workbench: Workbench;

    before(async () => {
        workbench = new Workbench();
        await workbench.executeCommand('Create: New File...');
        await (await InputBox.create()).selectQuickPick('Text File');
        await new Promise((res) => { setTimeout(res, 1000); });
        editor = await new EditorView().openEditor('Untitled-1') as TextEditor;

        await workbench.executeCommand('workbench.action.editor.changeLanguageMode');
        const quickOpenBox = await InputBox.create();
        await quickOpenBox.setText('sql');
        await quickOpenBox.confirm();
    });

    after(async () => {
        // cleanup, delete the file contents and close the editor
        await editor.clearText();
        await new EditorView().closeAllEditors();
    });

    it('Text manipulation', async () => {
        // // the file is currently empty, lets write something in it
        // // note the coordinates are (1, 1) for the beginning of the file
        // await editor.typeTextAt(1, 1, 'hello');

        // // now we can check if the text is correct
        // const text = await editor.getText();
        // expect(text).equals('hello');

        // we can also replace all the text with whatever we want
        await editor.setText(`SELECT 1;`);
        // assert how many lines there are now
        expect(await editor.getNumberOfLines()).equals(1);

        // the editor should be dirty since we haven't saved yet
        expect(await editor.isDirty()).is.true;

        await workbench.executeCommand('materialize.run');
    }).timeout(15000);

    it('Content Assist', async () => {
    });
});