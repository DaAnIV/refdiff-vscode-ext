import { CST } from './CST';

export interface SourceCodeAnalyzer {
    parse(files: Map<string, Buffer>): CST;
}
