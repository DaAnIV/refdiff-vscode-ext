# Evaluations

For examples to test the extension commits were mined and examples were taken from [RefDiff JS evaluation](https://github.com/aserg-ufmg/RefDiff/blob/master/refdiff-evaluation/src/test/java/refdiff/evaluation/js/ComputeRecallJs.java)

## Examples

1. **Move Function**

    <https://github.com/webpack/webpack/commit/b50d4cf7c370dc0f9fa2c39ea0e73e28ca8918ac>

    The function `getSchemaPartText` was moved from `lib/WebpackOptionsValidationError.js` to `lib/util/getSchemaPartText.js`

    ![Moved from](EvaluationResults/MoveFunction.png?raw=true)

    ![Moved to](EvaluationResults/MoveFunctionAfter.png?raw=true)

2. **Move And Rename Function**

    <https://github.com/webpack/webpack/commit/5da9d8c7ef29f954a37f58f5138f116579c6efe8>

    The function `getSize` was moved from `lib/Entrypoint.js` to `lib/SizeFormatHelpers.js` and renamed to `getEntrypointSize`

    ![Moved and renamed from](EvaluationResults/MoveAndRenameFunction.png?raw=true)

    ![Moved to](EvaluationResults/MoveAndRenameFunctionAfter.png?raw=true)

3. **Extract Function**
    <https://github.com/facebook/react/commit/24a83a5eeb1ccf4da1bdd97166d6c7c94d821bd8>

    The function `commitAllLifeCycles` was extracted from `commitAllWork` in `src/renderers/shared/fiber/ReactFiberScheduler.js`

    (`commitAllWork` has 2 extracted functions but the extension doesn't support this yet)

    ![Extracted](EvaluationResults/ExtractedFunction.png?raw=true)

4. **Inline Function**
    <https://github.com/meteor/meteor/commit/ec3341e7adb89889deadc1d3ecd8d8a181b958f1>

    The function `put` was inlined into `flushSetMany` in `packages/dynamic-import/cache.js`

    ![Inlined](EvaluationResults/InlinedFunction.png?raw=true)

5. **Rename Function**
    <https://github.com/facebook/react/commit/71f591501b639c4adf329e1f586c7e04875dde7f>

    The function `findNextUnitOfWork` was renamed to `resetNextUnitOfWork` in `src/renderers/shared/fiber/ReactFiberScheduler.js`

    ![Renamed](EvaluationResults/RenamedFunction.png?raw=true)

6. **Rename File**
    <https://github.com/facebook/react-native/commit/57daad98f01b59fce9cb9bf663fd0b191c56b232>

    The file `StaticContainer.js` was renamed to `StaticContainer.react.js` in the folder `Libraries/Components/`

    ![RenamedFile](EvaluationResults/RenamedFile.png?raw=true)

7. **Move File**
    <https://github.com/webpack/webpack/commit/756f2ca1779fd9836412041cbc9baa7912d490ae>

    The file `webpack.config.js` was moved from `test/configCases/plugins/dll-plugin/webpack.config.js` to `test/configCases/plugins/lib-manifest-plugin/webpack.config.js`

    ![MovedFile](EvaluationResults/MoveFile.png?raw=true)

8. **Move And Rename File**
    <https://github.com/webpack/webpack/commit/9156be961d890b9877ddef3a70964c9665662abb>

    The file `BaseWasmMainTemplatePlugin.js` from the folder `lib/` was renamed `WasmMainTemplatePlugin.js` and moved to `lib/wasm`

    ![MovedAndRenamedFile](EvaluationResults/MoveAndRenamedFile.png?raw=true)

9. **Rename class**
    <https://github.com/webpack/webpack/commit/9156be961d890b9877ddef3a70964c9665662abb>

    The class `BaseWasmMainTemplatePlugin` in `lib/BaseWasmMainTemplatePlugin.js` was renamed `WasmMainTemplatePlugin` in `lib/wasm/WasmMainTemplatePlugin.js`.

    (This is renaming since the files were matched as can be seen in 8.)

    ![RenamedClass](EvaluationResults/RenamedClass.png?raw=true)

10. **Function Added**
    <https://github.com/webpack/webpack/commit/b50d4cf7c370dc0f9fa2c39ea0e73e28ca8918ac>

    The function `getOptionsSchemaPartText` was added to `lib/WebpackOptionsValidationError.js`

    ![FunctionAdded](EvaluationResults/FunctionAdded.png?raw=true)
