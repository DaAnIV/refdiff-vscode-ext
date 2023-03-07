import * as vscode from 'vscode';
import { RefDiffTreeItem, RefDiffRootItem } from './refdiffTreeItem';

export class RefDiffTreeProvider implements vscode.TreeDataProvider<RefDiffTreeItem> {
  roots: Set<RefDiffRootItem> = new Set<RefDiffRootItem>();
  private _onDidChangeTreeData: vscode.EventEmitter<RefDiffTreeItem | undefined | null | void> = new vscode.EventEmitter<RefDiffTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<RefDiffTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  constructor(private workspaceRoot: vscode.Uri) {
    this.workspaceRoot = workspaceRoot;
  }

  public create(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand('refdiff.compare', (...commandArgs) => {
      console.log('refdiff.compare called!');
      let path1 = commandArgs[1][0].path;
      let path2 = commandArgs[1][1].path;
      this.compare(path1, path2);
    });
    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('refdiff.refresh', (...commandArgs) => {
      console.log('refdiff.refresh called!');
      let root = commandArgs[0] as RefDiffRootItem;
      root.refresh();
      this.refresh();
    });
    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('refdiff.delete', (...commandArgs) => {
      console.log('refdiff.delete called!');
      let root = commandArgs[0] as RefDiffRootItem;
      this.roots.delete(root);
      this.refresh();
    });
    context.subscriptions.push(disposable);

    const tree = vscode.window.createTreeView('refDiffCompareView', { treeDataProvider: this, showCollapseAll: true, canSelectMany: false });
    context.subscriptions.push(tree);

    tree.onDidChangeSelection((event) => {
      if (event.selection.length > 0) {
        event.selection[0].click();
      }
    });
  }

  getTreeItem(element: RefDiffTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: RefDiffTreeItem): Thenable<RefDiffTreeItem[]> {
    if (!this.workspaceRoot) {
      vscode.window.showInformationMessage('No dependency in empty workspace');
      return Promise.resolve([]);
    }
    if (element === undefined) {
      return Promise.resolve(Array.from(this.roots));
    }
    return Promise.resolve(Array.from((element as RefDiffRootItem).nodes));
  }

  compare(path1: string, path2: string) {
    this.roots.add(new RefDiffRootItem(path1, path2));
    this.refresh();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }
}
