# RefDiff Extension for VS Code

This extension implements the RefDiff 2.0 algorithm for detecting refactorings in code.
Currently, only javascript language is supported.

The extension implements the following relationships from RefDiff between code elements of two given revisions of a project.

* Same
* Convert Type
* Change Signature of Method/Function
* Rename
* Move
* Move and Rename
* Extract Supertype (e.g., Class/Interface)
* Extract Method/Function
* Inline Method/Function

It also has 2 new relationships

* Added
* Removed

which is set for any unmatched code element.

## Features

* Detects refactorings between two code elements that share a relationship, such as a method and its call sites.
* Presents a diff between the code elements, highlighting the changes made during the refactoring.
* Supports comparison of code elements selected by the user or changes in the git repository of the workspace.
* Any Detected relationship will also present if the code element body was modified.

## Usage

### Compare files/directories

1. Select the two files or directories in the explorer you want the compare
2. Right-click on one of the selected code elements and choose "Compare with RefDiff" from the context menu.
3. The extension will detect any refactorings between the selected files/directories and present a tree comparing them.
4. Click on files or code element to see the relevant diff.

If a git repository is detected you can also compare code elements from changes in the git repository of the workspace:

1. Just open the RefDiff activity bar and you will see the detected changes in code elements.
2. Click on files or code element to see the relevant diff.

To see a specific commit diff you can run the "RefDiff: Mine commit refactoring" command.

1. Run the "RefDiff: Mine commit refactoring" command.
2. Enter the commit hash you want to view
3. A tree showing the specific comiit changes will appear.
4. Click on files or code element to see the relevant diff.

## Requirements

## Extension Settings

This extension does not have any settings at the moment.

## Project structure

refDiffTS contains npm pacakges which implement the algorithm.

* `refdiffts-core` implements the core algorithm and data structures.
* `refdiffts-js` implements the source code analyzer for javascript.

The extension code which uses those pacakges sits in the `extension` folder

## Suporting a new language

1. Add a new package to the refDiffTS workspace named refdiffts-\<language\> (You can copy the refdiffts-js package as reference)
2. Implement the refdiffts-core `SourceCodeAnalyzer` interface.
In it implement the `parse` method which takes a list of code files and returns the parsed `CST` for them.
3. In the extension in `refdiffAnalyzer`
    1. Add the new language to the supported langauge array.
    2. Add a new case in `getAnalyzerForLanguage` which returns an instance of the analyzer.

## Contributing

If you encounter any bugs or issues with the extension, feel free to report them on the [GitHub repository](https://github.com/<your-username>/<your-repository>) for the extension. Contributions are also welcome.

## References

**[1]** D. Silva, J. P. da Silva, G. Santos, R. Terra and M. T. Valente, "[RefDiff 2.0: A Multi-Language Refactoring Detection Tool](http://dx.doi.org/10.1109/tse.2020.2968072)" in IEEE Transactions on Software Engineering, vol. 47, no. 12, pp. 2786-2802, 1 Dec. 2021, doi: 10.1109/TSE.2020.2968072.

**[2]** D. Silva and M. T. Valente, "[RefDiff: Detecting Refactorings in Version Histories](http://dx.doi.org/10.1109/msr.2017.14)" 2017 IEEE/ACM 14th International Conference on Mining Software Repositories (MSR), Buenos Aires, Argentina, 2017, pp. 269-279, doi: 10.1109/MSR.2017.14.

**[3]** Github [RefDiff Source Code](https://github.com/aserg-ufmg/RefDiff)