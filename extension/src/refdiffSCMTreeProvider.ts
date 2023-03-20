import * as vscode from 'vscode';
import { RefDiffTreeItem, RefDiffRootItem } from './refdiffTreeItem';
import * as vscodeGit from './git';
import * as git from 'simple-git';
import * as path from 'path';
import * as fs from 'fs';
import { RefDiffDocumentrovider } from './refdiffDocumentProvider';
import { RefDiffAnalyzer } from './refdiffAnalyzer';

let vscodeGitAPI: vscodeGit.API;

enum Stage {
    notInitialized,
    initializing,
    initialized
}

type RepoRoots = { changesRoot: RefDiffRootItem; stagedRoot: RefDiffRootItem };

export class RefDiffSCMTreeProvider
    implements vscode.TreeDataProvider<RefDiffTreeItem>, vscode.Disposable
{
    repoToRoots: Map<string, RepoRoots> = new Map<string, RepoRoots>();
    roots: Set<RefDiffRootItem> = new Set<RefDiffRootItem>();
    private _onDidChangeTreeData: vscode.EventEmitter<
        RefDiffTreeItem | undefined | null | void
    > = new vscode.EventEmitter<RefDiffTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<
        RefDiffTreeItem | undefined | null | void
    > = this._onDidChangeTreeData.event;
    private stage = Stage.notInitialized;
    private subscriptions: { dispose(): any }[] = [];
    private tree?: vscode.TreeView<RefDiffTreeItem>;

    constructor() {
    }

    dispose() {
        this.subscriptions.forEach((disposable) => {
            disposable.dispose();
        });
    }

    public async create() {
        let disposable = vscode.commands.registerCommand(
            'refdiffvsc.scm.refresh',
            (...commandArgs) => {
                console.log('refdiffvsc.scm.refresh called!');
                vscode.window.withProgress(
                    {
                        location: { viewId: 'refdiffvsc.SCMView' }
                    },
                    async (progress) => {
                        for (let repo of vscodeGitAPI.repositories) {
                            await this.refresh(repo);
                        }
                    }
                );
            }
        );
        this.subscriptions.push(disposable);

        disposable = vscode.commands.registerCommand(
            'refdiffvsc.scm.compare',
            () => {
                console.log('refdiffvsc.scm.compare called');

                if (vscodeGitAPI.repositories.length === 0) {
                    vscode.window.showErrorMessage('No repositories found');
                    return;
                }
                if (vscodeGitAPI.repositories.length > 1) {
                    vscode.window
                        .showQuickPick(
                            vscodeGitAPI.repositories.map(
                                (elem) => elem.rootUri.path
                            ),
                            {
                                title: 'Select repository',
                                placeHolder: 'repository',
                                canPickMany: false
                            }
                        )
                        .then((selected) => {
                            vscode.window.withProgress(
                                {
                                    location: { viewId: 'refdiffvsc.SCMView' }
                                },
                                async (progress) => {
                                    let repo = vscodeGitAPI.repositories.filter(
                                        (value) =>
                                            value.rootUri.path === selected
                                    )[0];
                                    await this.compareForRepo(repo);
                                }
                            );
                        });
                    return;
                } else {
                    vscode.window.withProgress(
                        {
                            location: { viewId: 'refdiffvsc.SCMView' }
                        },
                        async (progress) => {
                            await this.compareForRepo(
                                vscodeGitAPI.repositories[0]
                            );
                        }
                    );
                }
            }
        );
        this.subscriptions.push(disposable);
        disposable = vscode.commands.registerCommand(
            'refdiffvsc.scm.delete',
            (...commandArgs) => {
                console.log('refdiffvsc.scm.delete called!');
                let root = commandArgs[0] as RefDiffRootItem;
                this.roots.delete(root);
                this.refreshItems();
                RefDiffDocumentrovider.deleteRoot(root.documentRootID);
            }
        );
        this.subscriptions.push(disposable);

        this.tree = vscode.window.createTreeView('refdiffvsc.SCMView', {
            treeDataProvider: this,
            showCollapseAll: true,
            canSelectMany: false
        });
        this.subscriptions.push(this.tree);

        this.tree.onDidChangeSelection((event) => {
            if (event.selection.length > 0) {
                event.selection[0].click();
            }
        });

        let extension = vscode.extensions.getExtension<vscodeGit.GitExtension>(
            'vscode.git'
        ) as vscode.Extension<vscodeGit.GitExtension>;
        await extension.activate();
        this.createWithGit(extension.exports);
    }

    private async compareForRepo(vscodeRepo: vscodeGit.Repository) {
        let repo = git.simpleGit(vscodeRepo.rootUri.path, {
            binary: vscodeGitAPI.git.path
        });

        let selected = await vscode.window.showInputBox({
            title: 'Enter commit hash',
            placeHolder: 'commit hash'
        });
        if (selected === undefined) {
            return;
        }

        let log = await repo.log();
        let selectedIndex = log.all.findIndex(
            (value) => value.hash === selected
        );
        let selectedCommit = log.all[selectedIndex];
        let prevHash = undefined;
        if (selectedIndex + 1 < log.total) {
            prevHash = log.all[selectedIndex + 1].hash;
        }

        let summary = await repo.diffSummary(`${selectedCommit.hash}^!`);
        let beforeCommitBuffers = new Map<string, Buffer>();
        let afterCommitBuffers = new Map<string, Buffer>();
        for (let file of summary.files) {
            let beforePath = file.file;
            let afterPath = file.file;
            if (file.file.includes(' => ')) {
                let split = file.file.split(' => ', 2);
                beforePath = split[0];
                afterPath = split[1];
            }
            let lang = await RefDiffAnalyzer.getAnalyzerLanguage(beforePath);
            if (lang === undefined) {
                continue;
            }

            let content = await repo
                .show(`${selectedCommit.hash}:${beforePath}`)
                .catch(() => {
                    return undefined;
                });
            if (typeof content === 'string') {
                afterCommitBuffers.set(
                    beforePath,
                    Buffer.from(content, 'ascii')
                );
            }
            if (prevHash !== undefined) {
                content = await repo
                    .show(`${prevHash}:${afterPath}`)
                    .catch(() => {
                        return undefined;
                    });
                if (typeof content === 'string') {
                    beforeCommitBuffers.set(
                        afterPath,
                        Buffer.from(content, 'ascii')
                    );
                }
            }
        }

        let root = new RefDiffRootItem(
            path.basename(vscodeRepo.rootUri.path),
            `Commit ${selectedCommit.hash} - ${selectedCommit.message}`,
            'commitRoot'
        );
        root.refresh(beforeCommitBuffers, afterCommitBuffers);
        this.roots.add(root);
        this.refreshItems();

        this.tree?.reveal(root, { select: true, focus: true });
    }

    private createWithGit(gitExtension: vscodeGit.GitExtension) {
        if (this.stage !== Stage.notInitialized) {
            return;
        }
        this.stage = Stage.initializing;

        vscodeGitAPI = gitExtension.getAPI(1);

        let disposable = vscodeGitAPI.onDidOpenRepository(
            (repo: vscodeGit.Repository) => {
                this.initRepo(repo);
            }
        );
        vscodeGitAPI.repositories.forEach((repo) => {
            this.initRepo(repo);
        });
        this.subscriptions.push(disposable);
    }

    private initRepo(repo: vscodeGit.Repository) {
        console.log(path.basename(repo.rootUri.path));

        let stagedChangesRoot = new RefDiffRootItem(
            path.basename(repo.rootUri.path),
            'Staged Changes',
            'repoRoot'
        );
        let changesRoot = new RefDiffRootItem(
            path.basename(repo.rootUri.path),
            'Changes',
            'repoRoot'
        );
        this.roots.add(stagedChangesRoot);
        this.roots.add(changesRoot);
        this.repoToRoots.set(repo.rootUri.path, {
            changesRoot: changesRoot,
            stagedRoot: stagedChangesRoot
        });

        this.refresh(repo);
    }

    getTreeItem(element: RefDiffTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: RefDiffTreeItem): Thenable<RefDiffTreeItem[]> {
        if (element === undefined) {
            return Promise.resolve(Array.from(this.roots));
        }
        return Promise.resolve(Array.from((element as RefDiffRootItem).nodes));
    }

    getParent(
        element: RefDiffTreeItem
    ): vscode.ProviderResult<RefDiffTreeItem> {
        return element.parent();
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
            binary: vscodeGitAPI.git.path
        });

        let status = await repo.status();
        for (let value of status.files) {
            if (value.index === 'R') {
                value.from = this.getBeforeName(status, value.path);
            } else {
                value.from = value.path;
            }
        }

        let beforeIndexBuffers = new Map<string, Buffer>();
        let afterIndexBuffers = new Map<string, Buffer>();
        let beforeChangesBuffers = new Map<string, Buffer>();
        let afterChangesBuffers = new Map<string, Buffer>();

        for (let value of status.files) {
            let lang = await RefDiffAnalyzer.getAnalyzerLanguage(value.path);
            if (lang === undefined) {
                continue;
            }

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
                    beforeIndex = Buffer.from(
                        await repo.show(`@:${value.from}`),
                        'ascii'
                    );
                    afterIndex = Buffer.from(
                        await repo.show(`:${value.path}`),
                        'ascii'
                    );
                    beforeIndexBuffers.set(value.from as string, beforeIndex);
                    afterIndexBuffers.set(value.path, afterIndex);
                    break;
                case 'D':
                    beforeIndex = Buffer.from(
                        await repo.show(`@:${value.from}`),
                        'ascii'
                    );
                    beforeIndexBuffers.set(value.from as string, beforeIndex);
                    break;
                case 'A':
                    afterIndex = Buffer.from(
                        await repo.show(`:${value.path}`),
                        'ascii'
                    );
                    afterIndexBuffers.set(value.path, afterIndex);
                    break;
            }

            switch (value.working_dir) {
                case 'M':
                    beforeChanges = Buffer.from(
                        await repo.show(`:${value.path}`),
                        'ascii'
                    );
                    afterChanges = workingFile as Buffer;
                    beforeChangesBuffers.set(value.path, beforeChanges);
                    afterChangesBuffers.set(value.path, afterChanges);
                    break;
                case 'D':
                    beforeChanges = Buffer.from(
                        await repo.show(`:${value.path}`),
                        'ascii'
                    );
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

        await roots.changesRoot.refresh(
            beforeChangesBuffers,
            afterChangesBuffers
        );
        await roots.stagedRoot.refresh(beforeIndexBuffers, afterIndexBuffers);

        this.refreshItems();
    }

    refreshItems(): void {
        this._onDidChangeTreeData.fire();
    }
}
