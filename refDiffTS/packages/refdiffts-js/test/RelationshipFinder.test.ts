import { JSCodeAnalyzer } from '../src/JSCodeAnalyzer';
import * as core from '@refdiffts/core';
import { getMapFromPaths } from './utils';

describe('RelationshipFinder', () => {
  test('simple rename func1', () => {
    let analyzer = new JSCodeAnalyzer();
	let beforeFiles = getMapFromPaths([`${__dirname}/data/simple.js`]);
	let afterFiles = getMapFromPaths([`${__dirname}/data/simple.js`]);

    let before = analyzer.parse(beforeFiles);
    let after = analyzer.parse(afterFiles);

    let relationships = core.RelationshipFinder.findRelationships(
      before,
      after,
	  beforeFiles,
	  afterFiles
    );

    relationships.forEach((rel) => {
      if (rel.before !== undefined && rel.after !== undefined) {
        console.log(
          'Node %s(%s)->%s(%s) relationship: %s',
          rel.before.localName,
          rel.before.type,
          rel.after.localName,
          rel.after.type,
          core.RelationshipType[rel.type]
        );
      } else if (rel.before !== undefined) {
        console.log(
          'Node %s(%s) relationship: %s',
          rel.before.localName,
          rel.before.type,
          core.RelationshipType[rel.type]
        );
      } else if (rel.after !== undefined) {
        console.log(
          'Node %s(%s) relationship: %s',
          rel.after.localName,
          rel.after.type,
          core.RelationshipType[rel.type]
        );
      }
    });
  });
});
