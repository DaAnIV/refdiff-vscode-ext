import * as vscode from 'vscode';
import * as core from '@refdiffts/core';
import * as js from '@refdiffts/js';

export class RefDiffAnalyzer {
    public static supportedLangauges: string[] = ['javascript'];

    public static async getAnalyzerLanguage(
        path: string
    ): Promise<string | undefined> {
        let document = await vscode.workspace.openTextDocument(
            vscode.Uri.file(path).with({ scheme: 'empty' })
        );
        for (let language of this.supportedLangauges) {
            if (
                vscode.languages.match(
                    { scheme: 'empty', language: language },
                    document
                )
            ) {
                return language;
            }
        }
        return undefined;
    }

    public static getAnalyzerForLanguage(
        language: string
    ): core.SourceCodeAnalyzer | undefined {
        switch (language) {
            case 'javascript':
                return new js.JSCodeAnalyzer();
        }

        return undefined;
    }
}
