import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { RefDiffTreeItem, RefDiffRootItem } from './refdiffTreeItem';
import { RefDiffDocumentrovider } from './refdiffDocumentProvider';

class RefDiffCompareRootItem extends RefDiffRootItem
{
  constructor(public readonly path1: string, public readonly path2: string) {
    let label = `${path.basename(path1)}<->${path.basename(path2)}`;
    super(label, undefined, "root");
  }

  public refreshPaths() {
    let beforePaths = this.getFilesFromPath(this.path1);
    let afterPaths = this.getFilesFromPath(this.path2);
    let before = this.getBufferMapFromPaths(this.path1, beforePaths);
    let after = this.getBufferMapFromPaths(this.path2, afterPaths);
    super.refresh(before, after);
  }

  private getBufferMapFromPaths(root: string, paths: string[]): Map<string, Buffer> {
    let map = new Map<string, Buffer>();
    paths.forEach(value => {
      map.set(path.relative(root, value), fs.readFileSync(value));
    });
    return map;
  }
    
  private getFilesFromPath(pathToCheck: string): string[] {
    if (!fs.lstatSync(pathToCheck).isDirectory()) {
      return [pathToCheck];
    }
    let result: string[] = [];
    fs.readdirSync(pathToCheck).forEach((val) => {
      let fullPath = path.join(pathToCheck, val);
      result.push(...this.getFilesFromPath(fullPath));
    });
    return result;
  }
}

export class RefDiffTreeProvider implements vscode.TreeDataProvider<RefDiffTreeItem>, vscode.Disposable {
  roots: Set<RefDiffCompareRootItem> = new Set<RefDiffCompareRootItem>();
  private _onDidChangeTreeData: vscode.EventEmitter<RefDiffTreeItem | undefined | null | void> = new vscode.EventEmitter<RefDiffTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<RefDiffTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;
  private subscriptions: { dispose(): any }[] = [];

  constructor(private workspaceRoot: vscode.Uri) {
    this.workspaceRoot = workspaceRoot;
  }

  dispose() {
    this.subscriptions.forEach((disposable) => {
      disposable.dispose();
    });
  }

  public create() {
    let disposable : { dispose(): any };

    disposable = vscode.commands.registerCommand('refdiffvsc.refresh', (...commandArgs) => {
      console.log('refdiffvsc.refresh called!');
      let root = commandArgs[0] as RefDiffCompareRootItem;
      root.refreshPaths();
      this.refresh();
    });
    this.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('refdiffvsc.delete', (...commandArgs) => {
      console.log('refdiffvsc.delete called!');
      let root = commandArgs[0] as RefDiffCompareRootItem;
      this.roots.delete(root);
      this.refresh();
      RefDiffDocumentrovider.deleteRoot(root.documentRootID);
    });
    this.subscriptions.push(disposable);

    const tree = vscode.window.createTreeView('refdiffvsc.compareView', { treeDataProvider: this, showCollapseAll: true, canSelectMany: false });
    this.subscriptions.push(tree);

    tree.onDidChangeSelection((event) => {
      if (event.selection.length > 0) {
        event.selection[0].click();
      }
    });

    disposable = vscode.commands.registerCommand('refdiffvsc.compare', (...commandArgs) => {
      console.log('refdiffvsc.compare called!');
      let path1 = commandArgs[1][0].path;
      let path2 = commandArgs[1][1].path;
      let newRoot = this.compare(path1, path2);
      tree.reveal(newRoot, {select: true, focus: true});
    });
    this.subscriptions.push(disposable);
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

  getParent(element: RefDiffTreeItem): vscode.ProviderResult<RefDiffTreeItem> {
      return element.parent();
  }

  compare(path1: string, path2: string): RefDiffTreeItem {
    let newRoot = new RefDiffCompareRootItem(path1, path2);
    newRoot.refreshPaths();
    this.roots.add(newRoot);
    this.refresh();
    return newRoot;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }
}
