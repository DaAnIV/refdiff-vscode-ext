import * as vscode from 'vscode';
import { RefDiffTreeItem, RefDiffRootItem } from './refdiffTreeItem';
import * as vscodeGit from './git';
import * as git from 'simple-git';
import * as path from 'path';
import * as fs from 'fs';
import { openStdin } from 'process';

let vscodeGitAPI: vscodeGit.API;

enum Stage {
  notInitialized,
  initializing,
  initialized
};

type RepoRoots = { changesRoot: RefDiffRootItem, stagedRoot: RefDiffRootItem };

export class RefDiffSCMTreeProvider implements vscode.TreeDataProvider<RefDiffTreeItem>, vscode.Disposable {
  repoToRoots: Map<string, RepoRoots> = new Map<string, RepoRoots>();
  roots: Set<RefDiffRootItem> = new Set<RefDiffRootItem>();
  private _onDidChangeTreeData: vscode.EventEmitter<RefDiffTreeItem | undefined | null | void> = new vscode.EventEmitter<RefDiffTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<RefDiffTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;
  private stage = Stage.notInitialized;
  private subscriptions: { dispose(): any }[] = [];

  constructor(private workspaceRoot: vscode.Uri) {
    this.workspaceRoot = workspaceRoot;
  }

  dispose() {
    this.subscriptions.forEach((disposable) => {
      disposable.dispose();
    });
  }

  public async create() {
    let disposable = vscode.commands.registerCommand('refdiffvsc.scm.refresh', (...commandArgs) => {
      console.log('refdiffvsc.scm.refresh called!');
      vscodeGitAPI.repositories.forEach((repo) => {
        this.refresh(repo);
      });
    });
    this.subscriptions.push(disposable);

    const tree = vscode.window.createTreeView('refdiffvsc.SCMView', { treeDataProvider: this, showCollapseAll: true, canSelectMany: false });
    this.subscriptions.push(tree);

    tree.onDidChangeSelection((event) => {
      if (event.selection.length > 0) {
        event.selection[0].click();
      }
    });

    let extension = vscode.extensions.getExtension<vscodeGit.GitExtension>('vscode.git') as vscode.Extension<vscodeGit.GitExtension>;
    await extension.activate();
    this.createWithGit(extension.exports);
  }

  private createWithGit(gitExtension: vscodeGit.GitExtension) {
    if (this.stage !== Stage.notInitialized) {
      return;
    }
    this.stage = Stage.initializing;

    vscodeGitAPI = gitExtension.getAPI(1);

    let disposable = vscodeGitAPI.onDidOpenRepository((repo: vscodeGit.Repository) => {
      this.initRepo(repo);
    });
    vscodeGitAPI.repositories.forEach((repo) => {
      this.initRepo(repo);
    });
    this.subscriptions.push(disposable);
  }

  private initRepo(repo: vscodeGit.Repository) {
    console.log(path.basename(repo.rootUri.path));

    let stagedChangesRoot = new RefDiffRootItem(`${path.basename(repo.rootUri.path)} Staged Changes`);
    let changesRoot = new RefDiffRootItem(`${path.basename(repo.rootUri.path)} Changes`);
    this.roots.add(stagedChangesRoot);
    this.roots.add(changesRoot);
    this.repoToRoots.set(repo.rootUri.path, { changesRoot: changesRoot, stagedRoot: stagedChangesRoot });

    this.refresh(repo);
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

  private getBeforeName(status: git.StatusResult, path: string): string {
    for (let renamed of status.renamed) {
      if (renamed.to === path) {
        return renamed.from;
      }
    }
    return path;
  }

  async refresh(vscodeRepo: vscodeGit.Repository): Promise<void> {
    let repo = git.simpleGit(vscodeRepo.rootUri.path, {
      "binary": vscodeGitAPI.git.path
    });

    let status = await repo.status();
    for (let value of status.files) {
      if (value.index === 'R') {
        value.from = this.getBeforeName(status, value.path);
      } else {
        value.from = value.path;
      }
    }

    let sel: vscode.DocumentSelector = { scheme: 'empty', language: 'javascript' };
    let beforeIndexBuffers = new Map<string, Buffer>();
    let afterIndexBuffers = new Map<string, Buffer>();
    let beforeChangesBuffers = new Map<string, Buffer>();
    let afterChangesBuffers = new Map<string, Buffer>();

    for (let value of status.files) {
      let document = await vscode.workspace.openTextDocument(vscode.Uri.file(value.path).with({ scheme: 'empty' }));
      if(!vscode.languages.match(sel, document)) { continue; }
      let workingFile = undefined;
      let fullPath = path.join(vscodeRepo.rootUri.path, value.path);
      if (fs.existsSync(fullPath)) {
        workingFile = fs.readFileSync(fullPath);
      }
      let beforeIndex: Buffer;
      let afterIndex: Buffer;
      let beforeChanges: Buffer;
      let afterChanges: Buffer;
      switch (value.index) {
        case 'M':
        case 'R':
          beforeIndex = Buffer.from(await repo.show(`@:${value.from}`), 'ascii');
          afterIndex = Buffer.from(await repo.show(`:${value.path}`), 'ascii');
          beforeIndexBuffers.set(value.from as string, beforeIndex);
          afterIndexBuffers.set(value.path, afterIndex);
          break;
        case 'D':
          beforeIndex = Buffer.from(await repo.show(`@:${value.from}`), 'ascii');
          beforeIndexBuffers.set(value.from as string, beforeIndex);
          break;
        case 'A':
          afterIndex = Buffer.from(await repo.show(`:${value.path}`), 'ascii');
          afterIndexBuffers.set(value.path, afterIndex);
          break;
      }

      switch (value.working_dir) {
        case 'M':
          beforeChanges = Buffer.from(await repo.show(`:${value.path}`), 'ascii');
          afterChanges = workingFile as Buffer;
          beforeChangesBuffers.set(value.path, beforeChanges);
          afterChangesBuffers.set(value.path, afterChanges);
          break;
        case 'D':
          beforeChanges = Buffer.from(await repo.show(`:${value.path}`), 'ascii');
          beforeChangesBuffers.set(value.path, beforeChanges);
          break;
        case 'A':
        case '?':
          afterChanges = workingFile as Buffer;
          afterChangesBuffers.set(value.path, afterChanges);
          break;
      }
    }

    let roots = this.repoToRoots.get(vscodeRepo.rootUri.path) as RepoRoots;

    roots.changesRoot.refresh(beforeChangesBuffers, afterChangesBuffers);
    roots.stagedRoot.refresh(beforeIndexBuffers, afterIndexBuffers);

    this.refreshItems();
  }

  refreshItems(): void {
    this._onDidChangeTreeData.fire();
  }
}
