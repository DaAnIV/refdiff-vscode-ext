// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as dp from './refdiffTreeProvider';
import * as dpscm from './refdiffSCMTreeProvider';
import { EmptyDocumentrovider, RefDiffDocumentrovider } from './refdiffDocumentProvider';

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
		vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
			? vscode.workspace.workspaceFolders[0].uri
			: vscode.Uri.parse("");
	const diffProvider = new dp.RefDiffTreeProvider(rootPath);
	diffProvider.create();
	context.subscriptions.push(diffProvider);
	
	const diffSCMProvider = new dpscm.RefDiffSCMTreeProvider(rootPath);
	diffSCMProvider.create();
	context.subscriptions.push(diffSCMProvider);
}

// This method is called when your extension is deactivated
export function deactivate() { }

