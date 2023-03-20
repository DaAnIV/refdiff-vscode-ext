import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { RefDiffTreeItem, RefDiffRootItem } from './refdiffTreeItem';
import { RefDiffDocumentrovider } from './refdiffDocumentProvider';

class RefDiffCompareRootItem extends RefDiffRootItem {
    constructor(public readonly path1: string, public readonly path2: string) {
        let label = `${vscode.workspace.asRelativePath(path1, false)}<->${vscode.workspace.asRelativePath(path2, false)}`;
        super(label, undefined, 'root');
    }

    public async refreshPaths() {
        let beforePaths = this.getFilesFromPath(this.path1);
        let afterPaths = this.getFilesFromPath(this.path2);
        let before = this.getBufferMapFromPaths(this.path1, beforePaths);
        let after = this.getBufferMapFromPaths(this.path2, afterPaths);
        await super.refresh(before, after);
    }

    private getBufferMapFromPaths(
        root: string,
        paths: string[]
    ): Map<string, Buffer> {
        let map = new Map<string, Buffer>();
        paths.forEach((value) => {
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

export class RefDiffTreeProvider
    implements vscode.TreeDataProvider<RefDiffTreeItem>, vscode.Disposable
{
    roots: Set<RefDiffCompareRootItem> = new Set<RefDiffCompareRootItem>();
    private _onDidChangeTreeData: vscode.EventEmitter<
        RefDiffTreeItem | undefined | null | void
    > = new vscode.EventEmitter<RefDiffTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<
        RefDiffTreeItem | undefined | null | void
    > = this._onDidChangeTreeData.event;
    private subscriptions: { dispose(): any }[] = [];

    constructor() {}

    dispose() {
        this.subscriptions.forEach((disposable) => {
            disposable.dispose();
        });
    }

    public create() {
        let disposable: { dispose(): any };

        disposable = vscode.commands.registerCommand(
            'refdiffvsc.refresh',
            async (...commandArgs) => {
                console.log('refdiffvsc.refresh called!');
                let root = commandArgs[0] as RefDiffCompareRootItem;
                vscode.window.withProgress(
                    {
                        location: { viewId: 'refdiffvsc.compareView' }
                    },
                    async (progress) => {
                        await root.refreshPaths();
                        this.refresh();
                    }
                );
            }
        );
        this.subscriptions.push(disposable);

        disposable = vscode.commands.registerCommand(
            'refdiffvsc.delete',
            (...commandArgs) => {
                console.log('refdiffvsc.delete called!');
                let root = commandArgs[0] as RefDiffCompareRootItem;
                this.roots.delete(root);
                this.refresh();
                RefDiffDocumentrovider.deleteRoot(root.documentRootID);
            }
        );
        this.subscriptions.push(disposable);

        const tree = vscode.window.createTreeView('refdiffvsc.compareView', {
            treeDataProvider: this,
            showCollapseAll: true,
            canSelectMany: false
        });
        this.subscriptions.push(tree);

        tree.onDidChangeSelection((event) => {
            if (event.selection.length > 0) {
                event.selection[0].click();
            }
        });

        disposable = vscode.commands.registerCommand(
            'refdiffvsc.compare',
            (...commandArgs) => {
                console.log('refdiffvsc.compare called!');
                let path1 = commandArgs[1][0].path;
                let path2 = commandArgs[1][1].path;
                vscode.window.withProgress(
                    {
                        location: { viewId: 'refdiffvsc.compareView' }
                    },
                    async (progress) => {
                        let newRoot = await this.compare(path1, path2);
                        tree.reveal(newRoot, { select: true, focus: true });
                    }
                );
            }
        );
        this.subscriptions.push(disposable);
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

    async compare(path1: string, path2: string): Promise<RefDiffTreeItem> {
        let newRoot = new RefDiffCompareRootItem(path1, path2);
        await newRoot.refreshPaths();
        this.roots.add(newRoot);
        this.refresh();
        return newRoot;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
}
