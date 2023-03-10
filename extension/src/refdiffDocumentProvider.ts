import * as vscode from 'vscode';
import * as queryString from 'query-string';

type RefDiffFilesSetPair = { before: Map<string, Buffer>, after: Map<string, Buffer> };

export class RefDiffDocumentrovider implements vscode.TextDocumentContentProvider {
    public static readonly scheme = "refdiff";
    private static readonly instance = new RefDiffDocumentrovider();
    private rootsToFiles = new Map<number, RefDiffFilesSetPair>;

    public static register(): vscode.Disposable {
        return vscode.workspace.registerTextDocumentContentProvider(RefDiffDocumentrovider.scheme, this.instance);
    }

    provideTextDocumentContent(uri: vscode.Uri, token: vscode.CancellationToken): vscode.ProviderResult<string> {
        let query = queryString.parse(uri.query, { parseNumbers: true });
        if (!(typeof query.id === 'number') || !(typeof query.type === 'string')) {
            return undefined;
        }
        if (!(query.type === 'before' || query.type === 'after')) {
            return undefined;
        }
        let fileSet = undefined;
        let filesSetPair = this.rootsToFiles.get(query.id);
        if (filesSetPair === undefined) { return undefined; }
        if (query.type === 'before') {
            fileSet = filesSetPair.before;
        } else {
            fileSet = filesSetPair.after;
        }
        let buffer = fileSet.get(uri.path);
        if (buffer === undefined) {
            return undefined;
        }
        if (query.begin === undefined && query.end === undefined) {
            return buffer.toString('ascii');
        }

        if (typeof query.begin === 'number' && typeof query.end === 'number') {
            return buffer.toString('ascii', query.begin, query.end);
        }
        
        let begin: Array<number>;
        let end: Array<number>;
        if (query.begin instanceof Array<number> && query.end instanceof Array<number>) {
            begin = query.begin as Array<number>;
            end = query.end as Array<number>;
        } else {
            return undefined;
        }

        let result = buffer.toString('ascii', begin[0], end[0]);
        buffer = fileSet.get(query.file as string);
        if (buffer === undefined) {
            return undefined;
        }
        result += "\n\n";
        result += buffer.toString('ascii', begin[1], end[1]);

        return result;
    }

    public static addRoot(id: number, before: Map<string, Buffer>, after: Map<string, Buffer>) {
        this.instance.rootsToFiles.set(id, { before: before, after: after });
    }

    public static deleteRoot(id: number) {
        this.instance.rootsToFiles.delete(id);
    }
}
