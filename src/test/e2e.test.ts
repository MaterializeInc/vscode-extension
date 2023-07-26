import { expect } from 'chai';
import { ActivityBar, BottomBarPanel, By, DefaultTreeSection, EditorView, InputBox, SideBarView, TextEditor, WebView, Workbench } from 'vscode-extension-tester';

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
        // we can also replace all the text with whatever we want
        await editor.setText(`CREATE TABLE IF NOT EXISTS VS_CODE(VS_CODE_COLUMN INT);`);
        // assert how many lines there are now
        expect(await editor.getNumberOfLines()).equals(1);

        // the editor should be dirty since we haven't saved yet
        expect(await editor.isDirty()).is.true;

        await workbench.executeCommand('materialize.run');
    }).timeout(15000);

    it('Extension open', async () => {
        // Get reference to the activity bar
        const activityBar = new ActivityBar();

        // Find your extension in the activity bar
        const extension = await activityBar.getViewControl("Materialize");

        expect(extension).to.not.be.undefined;
        expect(extension && (await (await extension.openView()).isDisplayed())).is.true;
    });

    it('Schema Explorer', async () => {
        const view = new SideBarView();
        const content = view.getContent();
        const tree = await content.getSection('Explorer') as DefaultTreeSection;
        const items = await tree.getVisibleItems();
        const labels = await Promise.all(items.map(item => item.getLabel()));

        expect(labels).contains('Sources');
        expect(labels).contains('Views');
        expect(labels).contains('Materialized Views');
        expect(labels).contains('Tables');
        expect(labels).contains('Sinks');


        await tree.openItem('Tables');
        await tree.openItem('vs_code');
        const column = await tree.findItem('vs_code_column');
        expect(column).not.undefined;
    });

    it('Results', async () => {
        // we can also replace all the text with whatever we want
        // await editor.setText(`SELECT 100 as count;`);
        // // assert how many lines there are now
        // expect(await editor.getNumberOfLines()).equals(1);

        // // the editor should be dirty since we haven't saved yet
        // expect(await editor.isDirty()).is.true;

        // await workbench.executeCommand('materialize.run');

        // // Open the panel by specifying its title
        // await new Workbench().executeCommand(`View: Focus on Query Results View`);
        // const bottomBar = new BottomBarPanel();
        // const tableContainer = bottomBar.findElement(By.id('container'));

        // expect(await tableContainer.isDisplayed()).to.be.true;

        // const tabContainer = await bottomBar.findElement()
        // const tabs = await tabContainer.findElements(BottomBarPanel.locators.BottomBarPanel.tab(title));
        // await this.toggle(true);
        // const tabContainer = await this.findElement(BottomBarPanel.locators.BottomBarPanel.tabContainer);
        // try {
        //     const tabs = await tabContainer.findElements(BottomBarPanel.locators.BottomBarPanel.tab(title));
        //     if (tabs.length > 0) {
        //         await tabs[0].click();
        //     } else {
        //         const label = await tabContainer.findElement(By.xpath(`.//a[starts-with(@aria-label, '${title}')]`));
        //         await label.click();
        //     }
        // } catch (err) {
        //     await new Workbench().executeCommand(`${title}: Focus on ${title} View`);
        // }
    }).timeout(15000);


    it('Profiles', async () => {
        // const view = new SideBarView();
        // const content = view.getContent();
        // const webview = await content.getSection('Profile');
        // expect(await webview.isDisplayed()).to.be.true;
        // console.log("Get Text: ");
        // console.log(await webview.getText());
        // await webview.expand();
        // console.log("Get Text Again: ");
        // console.log(await webview.getText());
        // console.log(workbench.getSideBar().getContent());
        // const vscodeDropdown = await workbench.findElement(By.className('profile-container'));
        // expect(await vscodeDropdown.isDisplayed()).to.be.true;
        // await vscodeDropdown.click();

        // const element = await webview.findElement(By.css('vscode-dropdown'));
        // expect(await element.isDisplayed()).to.be.true;
    });
});