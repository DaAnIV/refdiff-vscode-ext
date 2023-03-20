// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as dp from './refdiffTreeProvider';
import * as dpscm from './refdiffSCMTreeProvider';
import {
    EmptyDocumentrovider,
    RefDiffDocumentrovider
} from './refdiffDocumentProvider';

const refDiffProvider = new dp.RefDiffTreeProvider();
const refDiffSCMProvider = new dpscm.RefDiffSCMTreeProvider();
const _onActivation = new vscode.EventEmitter<undefined>();
const onActivation = _onActivation.event;

export { refDiffProvider, refDiffSCMProvider, onActivation };

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "refdiffvsc" is now active!');

    let documentProvider = RefDiffDocumentrovider.register();
    context.subscriptions.push(documentProvider);

    documentProvider = EmptyDocumentrovider.register();
    context.subscriptions.push(documentProvider);

    const rootPath =
        vscode.workspace.workspaceFolders &&
        vscode.workspace.workspaceFolders.length > 0
            ? vscode.workspace.workspaceFolders[0].uri
            : vscode.Uri.parse('');
    refDiffProvider.create();
    context.subscriptions.push(refDiffProvider);

    refDiffSCMProvider.create();
    context.subscriptions.push(refDiffSCMProvider);

    _onActivation.fire(undefined);
}

// This method is called when your extension is deactivated
export function deactivate() {}
